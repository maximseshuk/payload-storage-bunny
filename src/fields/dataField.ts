import type { JSONField } from 'payload'

import type { BunnyData, CollectionContext } from '@/types/index.js'

export const dataField = (context: CollectionContext): JSONField => {
  return {
    name: 'bunnyData',
    type: 'json',
    admin: {
      disabled: true,
      hidden: true,
    },
    hooks: {
      afterRead: [
        ({ siblingData }) => {
          const videoId = (siblingData as { bunnyVideoId?: string })?.bunnyVideoId
          if (!videoId || !context.streamConfig) {
            return null
          }
          const bunnyData: BunnyData = {
            type: 'stream',
            stream: {
              libraryId: context.streamConfig.libraryId,
              videoId,
            },
          }

          return bunnyData
        },
      ],
    },
    typescriptSchema: [
      () => ({
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['stream'],
          },
          stream: {
            type: 'object',
            properties: {
              libraryId: {
                type: 'number',
              },
              videoId: {
                type: 'string',
              },
            },
            required: ['libraryId', 'videoId'],
          },
        },
        required: ['type', 'stream'],
      }),
    ],
    virtual: true,
  }
}
