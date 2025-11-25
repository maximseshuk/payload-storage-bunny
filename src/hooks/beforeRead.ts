import type { BunnyData } from '@/types/core.js'
import type { CollectionContext } from '@/types/index.js'
import type { CollectionBeforeReadHook } from 'payload'

export const getBeforeReadHook = (context: CollectionContext): CollectionBeforeReadHook => {
  return ({ doc }) => {
    if (!doc.bunnyVideoId || !context.streamConfig) {
      doc.bunnyData = null
      return doc
    }

    const bunnyData: BunnyData = {
      type: 'stream',
      stream: {
        libraryId: context.streamConfig.libraryId,
        videoId: doc.bunnyVideoId,
      },
    }

    doc.bunnyData = bunnyData

    return doc
  }
}
