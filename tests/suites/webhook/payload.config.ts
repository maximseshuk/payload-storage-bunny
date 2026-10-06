import type { Config } from 'payload'

import { bunnyStorage } from '@/index.js'

import { buildConfigWithDefaults } from '../../helpers/shared/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/shared/createMediaCollection.js'

export default buildConfigWithDefaults({
  collections: [
    createMediaCollection({ slug: 'webhook-test' }),
    createMediaCollection({ slug: 'webhook-drafts', versions: { drafts: true } }),
    createMediaCollection({ slug: 'webhook-plain' }),
  ],
  storage: [
    bunnyStorage({
      accountApiKey: process.env.BUNNY_ACCOUNT_API_KEY || '',
      collections: {
        'webhook-test': {
          disablePayloadAccessControl: true,
          prefix: 'webhook-test',
          signedUrls: false,
          stream: {
            mp4Fallback: true,
            tus: {
              autoMode: true,
            },
          },
        },
        'webhook-drafts': {
          disablePayloadAccessControl: true,
          prefix: 'webhook-drafts',
          signedUrls: false,
        },
        'webhook-plain': {
          disablePayloadAccessControl: true,
          prefix: 'webhook-plain',
          signedUrls: false,
          stream: { status: false },
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
        mp4Fallback: true,
        tus: true,
        webhook: {
          secret: 'test-webhook-secret',
        },
      },
    }),
  ],
} as Config)
