import type { JSONField } from 'payload'

export const dataField = (): JSONField => {
  return {
    name: 'bunnyData',
    type: 'json',
    admin: {
      disabled: true,
      hidden: true,
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
