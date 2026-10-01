import { sanitizePrefix } from '@payloadcms/plugin-cloud-storage/utilities'
import type { CollectionBeforeChangeHook, CollectionBeforeOperationHook } from 'payload'

import type { CollectionContext } from '@/shared/types/index.js'

import { readClientUpload, type VerifiedClientUpload } from './receipt.js'

const CLIENT_UPLOAD_CONTEXT_KEY = 'bunnyClientUpload'

type StoredClientUpload = { collection: string } & VerifiedClientUpload

export const getBeforeOperationHook =
  (context: CollectionContext): CollectionBeforeOperationHook =>
  ({ args, operation, req }) => {
    if ((operation === 'create' || operation === 'update') && req.file) {
      const clientUpload = readClientUpload({
        collectionSlug: context.collection.slug,
        filename: req.file.name,
        req,
        uploadReference: req.file.uploadReference,
      })
      if (clientUpload) {
        req.context[CLIENT_UPLOAD_CONTEXT_KEY] = { ...clientUpload, collection: context.collection.slug }
      }
    }
    return args
  }

export const getBeforeChangeHook =
  (context: CollectionContext): CollectionBeforeChangeHook =>
  ({ data, req }) => {
    if (!req.file) {
      return data
    }
    const stored = req.context?.[CLIENT_UPLOAD_CONTEXT_KEY] as StoredClientUpload | undefined
    if (stored?.collection !== context.collection.slug) {
      return data
    }
    data.prefix = sanitizePrefix(stored.prefix)
    if (!req.file.uploadReference) {
      return data
    }
    if (typeof stored.filesize === 'number') {
      data.filesize = stored.filesize
    }
    if (typeof stored.mimeType === 'string') {
      data.mimeType = stored.mimeType
    }
    return data
  }
