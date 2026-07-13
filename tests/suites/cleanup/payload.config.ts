import type { Config } from 'payload'

import { bunnyStorage } from '../../../src/index.js'
import { buildConfigWithDefaults } from '../../helpers/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/createMediaCollection.js'

export default buildConfigWithDefaults({
  collections: [createMediaCollection({ slug: 'cleanup-test' })],
  plugins: [
    bunnyStorage({
      apiKey: process.env.BUNNY_API_KEY || '',
      collections: {
        'cleanup-test': {
          disablePayloadAccessControl: true,
          prefix: 'cleanup-test',
          signedUrls: false,
        },
      },
      enabled: true,
      storage: {
        apiKey: process.env.BUNNY_STORAGE_API_KEY || '',
        hostname: process.env.BUNNY_STORAGE_HOSTNAME || '',
        zoneName: process.env.BUNNY_STORAGE_ZONE_NAME || '',
      },
      stream: {
        apiKey: process.env.BUNNY_STREAM_API_KEY || '',
        cleanup: {
          maxAge: 5,
          schedule: {
            cron: '13 37 * * *',
            queue: 'bunny-cleanup-test-queue',
          },
        },
        hostname: process.env.BUNNY_STREAM_HOSTNAME || '',
        libraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || ''),
        tus: true,
      },
    }),
  ],
} as Config)
