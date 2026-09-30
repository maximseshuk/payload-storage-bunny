import { sanitizePrefix } from '@payloadcms/plugin-cloud-storage/utilities'
import type { CollectionBeforeChangeHook, CollectionBeforeOperationHook } from 'payload'

import type { CollectionContext } from '@/shared/types/index.js'

const PREFIX_CONTEXT_KEY = 'bunnyClientUploadPrefix'

export const getBeforeOperationHook =
  (context: CollectionContext): CollectionBeforeOperationHook =>
  ({ args, operation, req }) => {
    const prefix = (req.file?.clientUploadContext as Record<string, unknown> | undefined)?.prefix
    if ((operation === 'create' || operation === 'update') && typeof prefix === 'string') {
      req.context[PREFIX_CONTEXT_KEY] = { collection: context.collection.slug, prefix }
    }
    return args
  }

export const getBeforeChangeHook =
  (context: CollectionContext): CollectionBeforeChangeHook =>
  ({ data, req }) => {
    if (!req.file) {
      return data
    }
    const stored = req.context?.[PREFIX_CONTEXT_KEY] as { collection: string; prefix: string } | undefined
    if (stored?.collection === context.collection.slug) {
      data.prefix = sanitizePrefix(stored.prefix)
    }
    const ctx = req.file.clientUploadContext
    if (!ctx || typeof ctx !== 'object') {
      return data
    }
    const { filesize, mimeType } = ctx as Record<string, unknown>
    if (typeof filesize === 'number') {
      data.filesize = filesize
    }
    if (typeof mimeType === 'string') {
      data.mimeType = mimeType
    }
    return data
  }
