import { posix } from 'node:path'

import type { PayloadHandler, PayloadRequest } from 'payload'
import sanitize from 'sanitize-filename'

import { createCollectionContext } from '@/config/context.js'
import { presignStoragePutUrl } from '@/storage/s3.js'
import type { NormalizedBunnyStorageConfig } from '@/types/configNormalized.js'
import { getSafeFileName } from '@/utils/file.js'
import { jsonResponse, sanitizePrefix } from '@/utils/http.js'
import { matchesMimeTypePattern } from '@/utils/mimeTypes.js'

import { mintEdgeUploadUrl } from './edge/mint.js'

type ClientUploadRequestBody = {
  collectionSlug?: string
  filename?: string
  filesize?: number
  mimeType?: string
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

    const hasAccess = clientUploads.access ? await clientUploads.access({ collectionSlug, req }) : Boolean(req.user)
    if (!hasAccess) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }

    const allowedMimeTypes = typeof collection.upload === 'object' ? collection.upload.mimeTypes : undefined
    if (
      Array.isArray(allowedMimeTypes) &&
      allowedMimeTypes.length > 0 &&
      !allowedMimeTypes.some((pattern) => matchesMimeTypePattern(mimeType, pattern))
    ) {
      return jsonResponse({ error: `File type "${mimeType}" is not allowed` }, 415)
    }

    const sizeLimit = req.payload.config.upload?.limits?.fileSize
    if (typeof filesize === 'number') {
      if (typeof sizeLimit === 'number' && filesize > sizeLimit) {
        return jsonResponse({ error: 'File exceeds the configured size limit' }, 413)
      }
      if (!storage.s3 && clientUploads.edge && filesize > clientUploads.edge.maxSize) {
        return jsonResponse({ error: 'File exceeds the configured size limit' }, 413)
      }
    }

    const resolvedPrefix = clientUploads.prefix
      ? await clientUploads.prefix({ collectionSlug, req })
      : (context.prefix ?? '')
    const prefix = sanitizePrefix(resolvedPrefix)

    const safeFilename = await getSafeFileName({
      collectionSlug,
      desiredFilename: sanitize(filename),
      req,
      staticPath: '',
    })

    const path = prefix ? posix.join(prefix, safeFilename) : safeFilename

    let url: string
    if (storage.s3) {
      url = await presignStoragePutUrl({
        apiKey: storage.apiKey,
        path,
        s3: storage.s3,
        zoneName: storage.zoneName,
      })
    } else {
      if (!clientUploads.edge) {
        return jsonResponse({ error: 'Edge uploads are not configured for this collection' }, 500)
      }
      url = mintEdgeUploadUrl({
        maxSize: clientUploads.edge.maxSize,
        path,
        scriptUrl: clientUploads.edge.scriptUrl,
        secret: clientUploads.edge.secret,
        zoneName: storage.zoneName,
      })
    }

    return jsonResponse({ filename: safeFilename, method: 'PUT', prefix, url })
  }
