import type { Config } from 'payload'

import { bunnyStorage } from '../../../src/index.js'
import { buildConfigWithDefaults } from '../../helpers/shared/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/shared/createMediaCollection.js'

export default buildConfigWithDefaults({
  collections: [
    createMediaCollection({ slug: 'mz-storage-global' }),
    createMediaCollection({ slug: 'mz-storage-signed' }),
    createMediaCollection({ slug: 'mz-stream-global', upload: { mimeTypes: ['image/*', 'video/mp4'] } }),
    createMediaCollection({ slug: 'mz-stream-signed', upload: { mimeTypes: ['image/*', 'video/mp4'] } }),
  ],
  plugins: [
    bunnyStorage({
      accountApiKey: process.env.BUNNY_ACCOUNT_API_KEY || '',
      collections: {
        'mz-storage-global': {
          disablePayloadAccessControl: true,
          prefix: 'mz-storage-global',
          signedUrls: false,
          stream: false,
        },
        'mz-storage-signed': {
          disablePayloadAccessControl: true,
          prefix: 'mz-storage-signed',
          signedUrls: { expiresIn: 3600 },
          storage: {
            apiKey: process.env.BUNNY_SIGNED_STORAGE_API_KEY || '',
            hostname: process.env.BUNNY_SIGNED_STORAGE_HOSTNAME || '',
            tokenSecurityKey: process.env.BUNNY_SIGNED_STORAGE_TOKEN_SECURITY_KEY || '',
            zoneName: process.env.BUNNY_SIGNED_STORAGE_ZONE_NAME || '',
          },
          stream: false,
        },
        'mz-stream-global': {
          disablePayloadAccessControl: true,
          prefix: 'mz-stream-global',
          signedUrls: false,
          storage: false,
          stream: {
            mimeTypes: ['video/*'],
            tus: { autoMode: true },
          },
        },
        'mz-stream-signed': {
          disablePayloadAccessControl: true,
          prefix: 'mz-stream-signed',
          signedUrls: { expiresIn: 3600 },
          storage: false,
          stream: {
            apiKey: process.env.BUNNY_SIGNED_STREAM_API_KEY || '',
            hostname: process.env.BUNNY_SIGNED_STREAM_HOSTNAME || '',
            libraryId: parseInt(process.env.BUNNY_SIGNED_STREAM_LIBRARY_ID || '0', 10),
            mimeTypes: ['video/*'],
            tokenSecurityKey: process.env.BUNNY_SIGNED_STREAM_TOKEN_SECURITY_KEY || '',
            tus: { autoMode: true },
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
        hostname: process.env.BUNNY_STREAM_HOSTNAME || '',
        libraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0', 10),
        tus: { autoMode: true },
      },
    }),
  ],
} as Config)
