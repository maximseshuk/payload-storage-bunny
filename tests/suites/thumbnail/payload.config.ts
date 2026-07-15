import type { Config } from 'payload'

import { bunnyStorage } from '../../../src/index.js'
import { buildConfigWithDefaults } from '../../helpers/shared/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/shared/createMediaCollection.js'

export default buildConfigWithDefaults({
  collections: [
    createMediaCollection({
      slug: 'thumbnail-global',
      upload: { imageSizes: [{ name: 'preview', height: 400, width: 300 }] },
    }),
    createMediaCollection({
      slug: 'thumbnail-custom',
      upload: {
        imageSizes: [{ name: 'thumbnail', height: 100, width: 100 }],
        mimeTypes: ['image/*', 'video/mp4'],
      },
    }),
    createMediaCollection({
      slug: 'thumbnail-disabled',
      upload: {
        imageSizes: [
          { name: 'thumbnail', height: 100, width: 100 },
          { name: 'preview', height: 400, width: 300 },
        ],
      },
    }),
    createMediaCollection({
      slug: 'thumbnail-stream-static',
      upload: {
        mimeTypes: ['image/*', 'video/mp4'],
      },
    }),
    createMediaCollection({
      slug: 'thumbnail-stream-animated',
      upload: {
        mimeTypes: ['image/*', 'video/mp4'],
      },
    }),
  ],
  plugins: [
    bunnyStorage({
      accountApiKey: process.env.BUNNY_ACCOUNT_API_KEY || '',
      collections: {
        'thumbnail-custom': {
          prefix: 'thumbnail-custom',
          stream: {
            mp4Fallback: true,
            thumbnailTime: 3000,
            tus: {
              autoMode: false,
            },
          },
          thumbnail: {
            sizeName: 'thumbnail',
            transformUrl: ({ baseUrl, data }) => {
              const timestamp = Date.now()
              const customId = (data?.id as string) || 'unknown'
              return `${baseUrl}?secure_thumb=true&id=${customId}&t=${timestamp}`
            },
          },
        },
        'thumbnail-disabled': {
          disablePayloadAccessControl: true,
          prefix: 'thumbnail-disabled',
          stream: {
            mimeTypes: ['video/*'],
          },
          thumbnail: false,
        },
        'thumbnail-global': {
          disablePayloadAccessControl: true,
          prefix: 'thumbnail-global',
          stream: false,
          thumbnail: {
            sizeName: 'preview',
            streamAnimated: false,
          },
        },
        'thumbnail-stream-animated': {
          disablePayloadAccessControl: true,
          prefix: 'thumbnail-stream-animated',
          stream: {},
          thumbnail: {
            streamAnimated: true,
          },
        },
        'thumbnail-stream-static': {
          prefix: 'thumbnail-stream-static',
          stream: {
            mp4Fallback: true,
            thumbnailTime: 3000,
            tus: {
              autoMode: false,
            },
          },
          thumbnail: {
            streamAnimated: false,
          },
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
        },
        hostname: process.env.BUNNY_STREAM_HOSTNAME || '',
        libraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || ''),
        mp4Fallback: true,
        thumbnailTime: 0,
        tus: false,
      },
      thumbnail: {
        appendTimestamp: true,
        queryParams: {
          class: 'thumbnail',
          version: '2.0',
        },
        sizeName: 'preview',
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
