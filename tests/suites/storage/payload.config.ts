import type { Config } from 'payload'

import { bunnyStorage } from '../../../src/index.js'
import { buildConfigWithDefaults } from '../../helpers/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/createMediaCollection.js'

export default buildConfigWithDefaults({
  collections: [createMediaCollection({ slug: 'storage-basic' })],
  plugins: [
    bunnyStorage({
      apiKey: process.env.BUNNY_API_KEY || '',
      collections: {
        'storage-basic': {
          disablePayloadAccessControl: true,
          prefix: 'storage-basic',
          signedUrls: false,
          stream: false,
        },
      },
      enabled: true,
      storage: {
        apiKey: process.env.BUNNY_STORAGE_API_KEY || '',
        hostname: process.env.BUNNY_STORAGE_HOSTNAME || '',
        zoneName: process.env.BUNNY_STORAGE_ZONE_NAME || '',
      },
    }),
  ],
} as Config)
