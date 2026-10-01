import type { Config } from 'payload'

import { bunnyStorage } from '../../../src/index.js'
import { buildConfigWithDefaults } from '../../helpers/shared/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/shared/createMediaCollection.js'

export default buildConfigWithDefaults({
  collections: [createMediaCollection({ slug: 'media' }), createMediaCollection({ slug: 'manual' })],
  jobs: {
    autoRun: [
      {
        cron: '* * * * *',
        queue: 'storage-bunny',
      },
    ],
  },
  storage: [
    bunnyStorage({
      accountApiKey: process.env.BUNNY_ACCOUNT_API_KEY || '',
      collections: {
        media: {
          disablePayloadAccessControl: true,
          prefix: 'media',
          stream: {},
        },
        manual: {
          disablePayloadAccessControl: true,
          prefix: 'manual',
          stream: { tus: { autoMode: false } },
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
          maxAge: 24 * 60 * 60,
          schedule: {
            cron: '* * * * *',
            queue: 'storage-bunny',
          },
        },
        hostname: process.env.BUNNY_STREAM_HOSTNAME || '',
        libraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || ''),
        mp4Fallback: true,
        thumbnailTime: 0,
        tus: true,
      },
    }),
  ],
} as Config)
