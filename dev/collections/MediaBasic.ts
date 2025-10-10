import type { CollectionConfig } from 'payload'

export const MediaBasic: CollectionConfig = {
  slug: 'mediaBasic',
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
  folders: true,
  upload: {
    disableLocalStorage: true,
    skipSafeFetch: true,
  },
}
