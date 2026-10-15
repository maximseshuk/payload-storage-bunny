import type { Config } from 'payload'

import { bunnyStorage } from '@/index.js'

import { buildConfigWithDefaults } from '../../helpers/shared/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/shared/createMediaCollection.js'

export default buildConfigWithDefaults({
  collections: [
    createMediaCollection({
      slug: 'webhook-rich-drafts',
      fields: [
        { name: 'title', type: 'text', localized: true },
        { name: 'items', type: 'array', fields: [{ name: 'label', type: 'text' }] },
      ],
      versions: { drafts: { autosave: true } },
    }),
  ],
  localization: { defaultLocale: 'en', locales: ['en', 'de'] },
  storage: [
    bunnyStorage({
      accountApiKey: process.env.BUNNY_ACCOUNT_API_KEY || '',
      collections: {
        'webhook-rich-drafts': {
          disablePayloadAccessControl: true,
          prefix: 'webhook-rich-drafts',
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
        mp4Fallback: true,
        tus: true,
        webhook: {
          secret: 'test-webhook-secret',
        },
      },
    }),
  ],
} as Config)
