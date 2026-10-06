import { randomUUID } from 'node:crypto'
import { posix } from 'node:path'

import { buildUploadStoragePathData } from '@payloadcms/plugin-cloud-storage/utilities'
import type { GenerateUploadInstructions, PayloadRequest, SanitizedCollectionConfig } from 'payload'
import { APIError, Forbidden } from 'payload'
import { assertClientUploadAccess, assertClientUploadAllowed } from 'payload/internal'
import sanitize from 'sanitize-filename'

import { presignStoragePutUrl, storageObjectExistsS3 } from '@/server/bunny/s3.js'
import { getSafeFileName } from '@/server/files.js'
import { hasStreamClientUploads } from '@/server/payload/stream/clientUploads.js'
import { isRestrictedFileType, matchesMimeTypePattern } from '@/shared/mimeTypes.js'
import type { CollectionContext } from '@/shared/types/index.js'

import { mintEdgeUploadUrl } from './mint.js'
import { signClientUpload } from './receipt.js'

const CLIENT_UPLOAD_HANDLER_NAME = 'bunny'

type ResolveClientUploadPrefixArgs = {
  collectionSlug: string
  filename: string
  req: PayloadRequest
}

export const resolveClientUploadPrefix = async (
  context: CollectionContext,
  { collectionSlug, filename, req }: ResolveClientUploadPrefixArgs,
): Promise<string> => {
  const clientUploads = context.storageOptions?.clientUploads
  const docPrefix =
    clientUploads && clientUploads.prefix ? await clientUploads.prefix({ collectionSlug, req }) : context.prefix
  return buildUploadStoragePathData({ collectionPrefix: context.prefix, docPrefix, filename }).sanitizedDocPrefix
}

type AssertClientUploadFileArgs = {
  collection: SanitizedCollectionConfig
  filename: string
  filesize: number
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
  if (!Number.isSafeInteger(filesize) || filesize < 0) {
    throw new APIError('Invalid file size', 400)
  }
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
  if (typeof sizeLimit === 'number' && filesize > sizeLimit) {
    throw new APIError('File exceeds the configured size limit', 413)
  }
}

export const getGenerateUploadInstructions =
  (context: CollectionContext): GenerateUploadInstructions =>
  async ({ collectionSlug, filename, filesize, mimeType, overrideAccess, req }) => {
    const collection = req.payload.collections?.[collectionSlug]?.config
    if (!collection) {
      throw new APIError(`Unknown collection "${collectionSlug}"`, 404)
    }

    const storage = context.storageOptions
    const clientUploads = storage?.clientUploads
    const isStreamUpload =
      hasStreamClientUploads(context) &&
      !!context.streamOptions?.mimeTypes.some((pattern) => matchesMimeTypePattern(mimeType, pattern))
    if (!isStreamUpload && !clientUploads) {
      throw new APIError(`Client uploads are not enabled for "${collectionSlug}"`, 403)
    }

    if (!overrideAccess) {
      const hasAccess = clientUploads?.access
        ? await clientUploads.access({ collectionSlug, req })
        : await assertClientUploadAccess({ collectionSlug, req }).then(
            () => true,
            () => false,
          )
      if (!hasAccess) {
        throw new Forbidden(req.t)
      }
    }

    assertClientUploadFile({ collection, filename, filesize, mimeType, req })

    if (isStreamUpload || !storage || !clientUploads) {
      return {
        name: CLIENT_UPLOAD_HANDLER_NAME,
        type: 'dispatch',
        file: { filename: sanitize(filename), mimeType, size: filesize, uploadReference: {} },
      }
    }

    if (!storage.s3 && clientUploads.edge && filesize > clientUploads.edge.maxSize) {
      throw new APIError('File exceeds the configured size limit', 413)
    }

    const safeFilename = await getSafeFileName({
      collectionSlug,
      desiredFilename: sanitize(filename),
      req,
      staticPath: '',
    })

    const basePrefix = await resolveClientUploadPrefix(context, { collectionSlug, filename: safeFilename, req })
    const { sanitizedDocPrefix: prefix, storageFilePath: path } = buildUploadStoragePathData({
      collectionPrefix: context.prefix,
      docPrefix: posix.join(basePrefix, randomUUID()),
      filename: safeFilename,
    })

    let url: string
    const headers: Record<string, string> = { 'Content-Type': mimeType }
    if (storage.s3) {
      const credentials = { apiKey: storage.apiKey, region: storage.region, zoneName: storage.zoneName }
      if (await storageObjectExistsS3({ ...credentials, path })) {
        throw new APIError('A file already exists at this path', 409)
      }
      url = await presignStoragePutUrl({
        ...credentials,
        contentLength: filesize,
        contentType: mimeType,
        path,
      })
      headers['If-None-Match'] = '*'
    } else {
      if (!clientUploads.edge) {
        throw new APIError('Edge uploads are not configured for this collection', 500)
      }
      url = mintEdgeUploadUrl({
        maxSize: clientUploads.edge.maxSize,
        path,
        scriptUrl: clientUploads.edge.scriptUrl,
        secret: clientUploads.edge.secret,
        size: filesize,
        type: mimeType,
        zoneName: storage.zoneName,
      })
    }

    const signedReceipt = signClientUpload({
      claims: { filesize, mimeType },
      collectionSlug,
      filename: safeFilename,
      prefix,
      req,
    })

    return {
      type: 'http',
      file: { filename: safeFilename, mimeType, size: filesize, uploadReference: { prefix, signedReceipt } },
      request: { headers, method: 'PUT', url },
    }
  }
