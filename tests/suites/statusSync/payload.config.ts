import type { Config } from 'payload'

import { bunnyStorage } from '@/index.js'

import { buildConfigWithDefaults } from '../../helpers/shared/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/shared/createMediaCollection.js'

export default buildConfigWithDefaults({
  collections: [createMediaCollection({ slug: 'status-sync-test' })],
  storage: [
    bunnyStorage({
      accountApiKey: process.env.BUNNY_ACCOUNT_API_KEY || '',
      collections: {
        'status-sync-test': {
          disablePayloadAccessControl: true,
          prefix: 'status-sync-test',
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
        hostname: process.env.BUNNY_STREAM_HOSTNAME || '',
        libraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || ''),
        status: {
          sync: {
            schedule: {
              cron: '13 37 * * *',
              queue: 'bunny-status-sync-test-queue',
            },
          },
        },
      },
      tasks: { secret: 'status-sync-test-secret' },
    }),
  ],
} as Config)
