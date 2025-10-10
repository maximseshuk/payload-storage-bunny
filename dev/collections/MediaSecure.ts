import type { CollectionConfig } from 'payload'

export const MediaSecure: CollectionConfig = {
  slug: 'mediaSecure',
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
    imageSizes: [
      {
        name: 'thumbnail',
        height: 100,
        width: 100,
      },
      {
        name: 'preview',
        height: 400,
        width: 300,
      },
    ],
    skipSafeFetch: true,
  },
}
