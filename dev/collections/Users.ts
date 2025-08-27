import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  fields: [
    {
      name: 'avatar',
      type: 'upload',
      hasMany: false,
      relationTo: 'media',
    },
  ],
}
