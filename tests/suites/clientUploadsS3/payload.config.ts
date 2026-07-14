import type { Config } from 'payload'

import { bunnyStorage } from '../../../src/index.js'
import { buildConfigWithDefaults } from '../../helpers/shared/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/shared/createMediaCollection.js'

export default buildConfigWithDefaults({
  collections: [
    createMediaCollection({
      slug: 'client-uploads-s3',
      upload: { mimeTypes: ['image/*'] },
    }),
  ],
  plugins: [
    bunnyStorage({
      clientUploads: {},
      collections: {
        'client-uploads-s3': {
          prefix: 'client-uploads-s3',
        },
      },
      enabled: true,
      storage: {
        apiKey: process.env.BUNNY_S3_STORAGE_API_KEY || '',
        hostname: process.env.BUNNY_S3_STORAGE_HOSTNAME || '',
        s3: { region: process.env.BUNNY_S3_STORAGE_REGION || 'de' },
        zoneName: process.env.BUNNY_S3_STORAGE_ZONE_NAME || '',
      },
    }),
  ],
} as Config)
