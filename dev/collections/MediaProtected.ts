import type { CollectionConfig } from 'payload'

export const MediaProtected: CollectionConfig = {
  slug: 'mediaProtected',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    disableLocalStorage: true,
    mimeTypes: ['video/mp4'],
    skipSafeFetch: true,
  },
}
