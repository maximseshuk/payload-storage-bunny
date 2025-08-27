import type { CollectionConfig } from 'payload'

export const streamUploadSessionsCollectionSlug = 'bunny-stream-upload-sessions'

export const getStreamUploadSessionsCollection = (): CollectionConfig => {
  return {
    slug: streamUploadSessionsCollectionSlug,
    access: {
      create: () => false,
      delete: () => false,
      read: () => false,
      update: () => false,
    },
    admin: {
      hidden: true,
    },
    fields: [
      {
        name: 'libraryId',
        type: 'text',
        index: true,
        required: true,
      },
      {
        name: 'videoId',
        type: 'text',
        index: true,
        required: true,
      },
    ],
    lockDocuments: false,
    timestamps: true,
  }
}
