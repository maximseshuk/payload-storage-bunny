import type { CollectionBeforeReadHook } from 'payload'

import { setBunnyData } from '@/utils/requestContext.js'

export const getBeforeReadHook = (): CollectionBeforeReadHook => {
  return ({ context, doc }) => {
    if (!context.bunnyData?.stream?.videoId && doc.bunnyVideoId) {
      setBunnyData(context, {
        stream: {
          resolutions: doc.bunnyVideoResolutions,
          videoId: doc.bunnyVideoId,
        },
      })
    }

    return doc
  }
}
