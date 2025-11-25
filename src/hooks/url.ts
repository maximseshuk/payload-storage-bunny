import type { CollectionContext } from '@/types/index.js'
import type { FieldHook } from 'payload'

import { applyUrlTransform } from '@/utils/index.js'

type Args = {
  context: CollectionContext
  size?: { name: string }
}

export const getUrlAfterReadFieldHook = ({ context, size }: Args): FieldHook => {
  return ({ data, value }) => {
    const filename = size ? data?.sizes?.[size.name]?.filename : data?.filename
    const prefix = data?.prefix
    let url = value

    if (context.usePayloadAccessControl && context.urlTransform && url && typeof url === 'string') {
      url = applyUrlTransform({
        collection: context.collection,
        config: context.urlTransform,
        data,
        filename: filename || '',
        prefix: prefix || '',
        url,
      })
    }

    return url
  }
}
