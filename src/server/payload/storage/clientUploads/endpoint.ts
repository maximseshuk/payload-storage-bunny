import { buildUploadStoragePathData } from '@payloadcms/plugin-cloud-storage/utilities'
import type { PayloadHandler, PayloadRequest, SanitizedCollectionConfig } from 'payload'
import { APIError } from 'payload'
import {
  assertClientUploadAccess,
  assertClientUploadAllowed,
  assertClientUploadFileSize,
  createClientUploadReceipt,
} from 'payload/internal'
import sanitize from 'sanitize-filename'

import { presignStoragePutUrl, storageObjectExistsS3 } from '@/server/bunny/s3.js'
import { getSafeFileName } from '@/server/files.js'
import { createCollectionContext } from '@/server/payload/config/context.js'
import { jsonResponse } from '@/shared/http.js'
import { isRestrictedFileType, matchesMimeTypePattern } from '@/shared/mimeTypes.js'
import type { NormalizedBunnyStorageConfig } from '@/shared/types/configNormalized.js'

import { mintEdgeUploadUrl } from './mint.js'

type ClientUploadRequestBody = {
  collectionSlug?: string
  filename?: string
  filesize?: unknown
  mimeType?: string
}

type AssertClientUploadFileArgs = {
  collection: SanitizedCollectionConfig
  filename: string
  filesize: unknown
  mimeType: string
  req: PayloadRequest
}

export const assertClientUploadFile = ({
  collection,
  filename,
  filesize,
  mimeType,
  req,
}: AssertClientUploadFileArgs): void => {
  assertClientUploadFileSize(filesize)
  assertClientUploadAllowed({ collection, filename, mimeType })

  const allowRestrictedFileTypes = typeof collection.upload === 'object' && collection.upload.allowRestrictedFileTypes
  if (!allowRestrictedFileTypes && isRestrictedFileType(sanitize(filename), mimeType)) {
    throw new APIError(`File type "${mimeType}" is not allowed`, 415)
  }

  const allowedMimeTypes = typeof collection.upload === 'object' ? collection.upload.mimeTypes : undefined
  if (
    Array.isArray(allowedMimeTypes) &&
    allowedMimeTypes.length > 0 &&
    !allowedMimeTypes.some((pattern) => matchesMimeTypePattern(mimeType, pattern))
  ) {
    throw new APIError(`File type "${mimeType}" is not allowed`, 415)
  }

  const sizeLimit = req.payload.config.upload?.limits?.fileSize
  if (typeof sizeLimit === 'number' && (filesize as number) > sizeLimit) {
    throw new APIError('File exceeds the configured size limit', 413)
  }
}

export const getClientUploadHandler =
  (config: NormalizedBunnyStorageConfig): PayloadHandler =>
  async (req: PayloadRequest): Promise<Response> => {
    let body: ClientUploadRequestBody
    try {
      body = ((await req.json?.()) ?? {}) as ClientUploadRequestBody
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400)
    }

    const { collectionSlug, filename, filesize, mimeType } = body
    if (!collectionSlug || !filename || !mimeType) {
      return jsonResponse({ error: 'Missing collectionSlug, filename, or mimeType' }, 400)
    }

    const collection = req.payload.collections?.[collectionSlug]?.config
    if (!collection) {
      return jsonResponse({ error: `Unknown collection "${collectionSlug}"` }, 404)
    }

    const context = createCollectionContext(config, collection)
    const storage = context.storageConfig
    const clientUploads = storage?.clientUploads
    if (!clientUploads || !storage) {
      return jsonResponse({ error: `Client uploads are not enabled for "${collectionSlug}"` }, 403)
    }

    const hasAccess = clientUploads.access
      ? await clientUploads.access({ collectionSlug, req })
      : await assertClientUploadAccess({ collectionSlug, req }).then(
          () => true,
          () => false,
        )
    if (!hasAccess) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }

    try {
      assertClientUploadFile({ collection, filename, filesize, mimeType, req })
    } catch (err) {
      return jsonResponse({ error: (err as APIError).message }, (err as APIError).status)
    }
    const size = filesize as number

    if (!storage.s3 && clientUploads.edge && size > clientUploads.edge.maxSize) {
      return jsonResponse({ error: 'File exceeds the configured size limit' }, 413)
    }

    const docPrefix = clientUploads.prefix
      ? await clientUploads.prefix({ collectionSlug, req })
      : (context.prefix ?? '')

    const safeFilename = await getSafeFileName({
      collectionSlug,
      desiredFilename: sanitize(filename),
      req,
      staticPath: '',
    })

    const { sanitizedDocPrefix: prefix, storageFilePath: path } = buildUploadStoragePathData({
      collectionPrefix: context.prefix,
      docPrefix,
      filename: safeFilename,
    })

    let url: string
    const headers: Record<string, string> = { 'Content-Type': mimeType }
    if (storage.s3) {
      const credentials = { apiKey: storage.apiKey, s3: storage.s3, zoneName: storage.zoneName }
      if (await storageObjectExistsS3({ ...credentials, path })) {
        return jsonResponse({ error: 'A file already exists at this path' }, 409)
      }
      url = await presignStoragePutUrl({
        ...credentials,
        contentLength: size,
        contentType: mimeType,
        path,
        s3: storage.s3,
        zoneName: storage.zoneName,
      })
      headers['If-None-Match'] = '*'
    } else {
      if (!clientUploads.edge) {
        return jsonResponse({ error: 'Edge uploads are not configured for this collection' }, 500)
      }
      url = mintEdgeUploadUrl({
        maxSize: clientUploads.edge.maxSize,
        path,
        scriptUrl: clientUploads.edge.scriptUrl,
        secret: clientUploads.edge.secret,
        size,
        type: mimeType,
        zoneName: storage.zoneName,
      })
    }

    const signedReceipt = createClientUploadReceipt({
      collectionSlug,
      context: { filesize: size, mimeType, prefix },
      filename: safeFilename,
      req,
    })

    return jsonResponse({
      clientUploadContext: { prefix, signedReceipt },
      filename: safeFilename,
      headers,
      method: 'PUT',
      prefix,
      url,
    })
  }
