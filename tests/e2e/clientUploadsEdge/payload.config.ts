import type { Config } from 'payload'

import { bunnyStorage } from '../../../src/index.js'
import { buildConfigWithDefaults } from '../../helpers/shared/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/shared/createMediaCollection.js'

export default buildConfigWithDefaults({
  collections: [
    createMediaCollection({
      slug: 'client-uploads-edge',
      upload: { mimeTypes: ['image/*'] },
    }),
  ],
  plugins: [
    bunnyStorage({
      collections: {
        'client-uploads-edge': {
          prefix: 'client-uploads-edge',
        },
      },
      enabled: true,
      storage: {
        apiKey: process.env.BUNNY_STORAGE_API_KEY || '',
        clientUploads: {
          edge: {
            scriptUrl: process.env.BUNNY_EDGE_SCRIPT_URL || 'https://uploader.invalid',
            secret: process.env.BUNNY_EDGE_SECRET || 'placeholder-secret',
          },
        },
        hostname: process.env.BUNNY_STORAGE_HOSTNAME || '',
        zoneName: process.env.BUNNY_STORAGE_ZONE_NAME || '',
      },
    }),
  ],
} as Config)
