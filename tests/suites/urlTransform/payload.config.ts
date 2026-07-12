import type { Config } from 'payload'

import { bunnyStorage } from '../../../src/index.js'
import { buildConfigWithDefaults } from '../../helpers/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/createMediaCollection.js'

export default buildConfigWithDefaults({
  collections: [
    createMediaCollection({ slug: 'url-transform-global' }),
    createMediaCollection({
      slug: 'url-transform-unsigned',
      upload: { mimeTypes: ['image/*', 'video/mp4'] },
    }),
    createMediaCollection({ slug: 'url-transform-custom' }),
    createMediaCollection({
      slug: 'url-transform-static',
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
        'url-transform-custom': {
          disablePayloadAccessControl: true,
          prefix: 'url-transform-custom',
          stream: {
            mimeTypes: ['video/*'],
          },
          urlTransform: {
            transformUrl: ({ baseUrl, data }) => {
              const isVideo = typeof data?.mimeType === 'string' && data.mimeType.startsWith('video/')
              const quality = isVideo ? 'hd' : 'original'
              const sessionId = Math.random().toString(36).substr(2, 9)
              return `${baseUrl}?quality=${quality}&session=${sessionId}&secure=true`
            },
          },
        },
        'url-transform-global': {
          disablePayloadAccessControl: true,
          prefix: 'url-transform-global',
          stream: {
            mimeTypes: ['video/*'],
            tus: {
              autoMode: true,
            },
          },
        },
        'url-transform-static': {
          prefix: 'url-transform-static',
          stream: {
            mp4Fallback: true,
            tus: {
              autoMode: false,
            },
          },
        },
        'url-transform-unsigned': {
          prefix: 'url-transform-unsigned',
          stream: {
            mp4Fallback: true,
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
      urlTransform: {
        appendTimestamp: false,
        queryParams: {
          cdn: 'bunny',
          region: 'eu',
        },
      },
    }),
  ],
} as Config)
