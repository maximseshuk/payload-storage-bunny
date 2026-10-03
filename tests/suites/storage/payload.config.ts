import type { Config } from 'payload'

import { bunnyStorage } from '@/index.js'

import { buildConfigWithDefaults } from '../../helpers/shared/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/shared/createMediaCollection.js'

export default buildConfigWithDefaults({
  collections: [
    createMediaCollection({
      slug: 'storage-basic',
      upload: { imageSizes: [{ name: 'preview', height: 400, width: 300 }] },
    }),
    createMediaCollection({
      slug: 'thumbnail-custom',
      upload: { imageSizes: [{ name: 'thumbnail', height: 100, width: 100 }] },
    }),
    createMediaCollection({
      slug: 'thumbnail-disabled',
      upload: { imageSizes: [{ name: 'preview', height: 400, width: 300 }] },
    }),
  ],
  storage: [
    bunnyStorage({
      accountApiKey: process.env.BUNNY_ACCOUNT_API_KEY || '',
      collections: {
        'storage-basic': {
          disablePayloadAccessControl: true,
          prefix: 'storage-basic',
          signedUrls: false,
        },
        'thumbnail-custom': {
          disablePayloadAccessControl: true,
          prefix: 'thumbnail-custom',
          signedUrls: false,
          thumbnail: {
            sizeName: 'thumbnail',
            urlTransform: ({ baseUrl, data }) => `${baseUrl}?secure_thumb=true&id=${String(data?.id)}`,
          },
        },
        'thumbnail-disabled': {
          disablePayloadAccessControl: true,
          prefix: 'thumbnail-disabled',
          signedUrls: false,
          thumbnail: false,
        },
      },
      enabled: true,
      storage: {
        apiKey: process.env.BUNNY_STORAGE_API_KEY || '',
        hostname: process.env.BUNNY_STORAGE_HOSTNAME || '',
        zoneName: process.env.BUNNY_STORAGE_ZONE_NAME || '',
      },
      thumbnail: {
        sizeName: 'preview',
        urlTransform: {
          appendTimestamp: true,
          queryParams: { class: 'thumbnail', version: '2.0' },
        },
      },
      urlTransform: {
        appendTimestamp: false,
        queryParams: { cdn: 'bunny', region: 'eu' },
      },
    }),
  ],
} as Config)
