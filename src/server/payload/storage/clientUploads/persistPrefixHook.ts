import { sanitizePrefix } from '@payloadcms/plugin-cloud-storage/utilities'
import type { CollectionBeforeChangeHook } from 'payload'

import type { CollectionContext } from '@/shared/types/index.js'

export const getBeforeChangeHook =
  (_context: CollectionContext): CollectionBeforeChangeHook =>
  ({ data, req }) => {
    const ctx = req.file?.clientUploadContext
    if (ctx && typeof ctx === 'object' && 'prefix' in ctx && typeof (ctx as { prefix: unknown }).prefix === 'string') {
      data.prefix = sanitizePrefix((ctx as { prefix: string }).prefix)
    }
    return data
  }
