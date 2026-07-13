import type { Config } from 'payload'

import { bunnyStorage } from '../../../src/index.js'
import { buildConfigWithDefaults } from '../../helpers/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/createMediaCollection.js'

export default buildConfigWithDefaults({
  collections: [
    createMediaCollection({ slug: 'stream-auto' }),
    createMediaCollection({
      slug: 'stream-manual',
      upload: { mimeTypes: ['image/*', 'video/mp4'] },
    }),
  ],
  jobs: {
    autoRun: [
      {
        cron: '* * * * *',
        queue: 'storage-bunny',
      },
    ],
  },
  plugins: [
    bunnyStorage({
      apiKey: process.env.BUNNY_API_KEY || '',
      collections: {
        'stream-auto': {
          disablePayloadAccessControl: true,
          prefix: 'stream-auto',
          signedUrls: false,
          stream: {
            mimeTypes: ['video/*'],
            mp4Fallback: false,
            tus: {
              autoMode: true,
            },
          },
        },
        'stream-manual': {
          prefix: 'stream-manual',
          signedUrls: false,
          stream: {
            mp4Fallback: true,
            thumbnailTime: 3000,
            tus: {
              autoMode: false,
            },
          },
        },
      },
      enabled: true,
      i18n: {
        translations: {
          en: {
            tusUploadEnableMode: 'Enable tus mode',
          },
        },
      },
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
