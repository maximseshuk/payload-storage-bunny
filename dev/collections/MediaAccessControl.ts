import type { CollectionConfig } from 'payload'

export const MediaAccessControl: CollectionConfig = {
  slug: 'mediaAccessControl',
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
