import type { CollectionContext } from '@/types/index.js'
import type { FieldHook } from 'payload'

import { getAdminThumbnail } from '@/handlers/index.js'

type Args = {
  context: CollectionContext
  size?: { name: string }
}

export const getThumbnailURLAfterReadFieldHook = ({ context }: Args): FieldHook => {
  const adminThumbnailFn = getAdminThumbnail(context)

  return ({ originalDoc, req }) => {
    if (!adminThumbnailFn || !originalDoc) {
      return null
    }

    return adminThumbnailFn({ doc: originalDoc, req })
  }
}
