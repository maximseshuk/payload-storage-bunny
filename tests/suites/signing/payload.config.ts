import type { Config } from 'payload'

import { bunnyStorage } from '../../../src/index.js'
import { buildConfigWithDefaults } from '../../helpers/shared/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/shared/createMediaCollection.js'

export default buildConfigWithDefaults({
  collections: [
    createMediaCollection({ slug: 'storageMedia' }),
    createMediaCollection({ slug: 'streamMedia', upload: { mimeTypes: ['video/*'] } }),
  ],
  plugins: [
    bunnyStorage({
      collections: {
        storageMedia: {
          disablePayloadAccessControl: true,
          prefix: 'signed-storage',
          stream: false,
        },
        streamMedia: {
          disablePayloadAccessControl: true,
          storage: false,
        },
      },
      signedUrls: {
        expiresIn: 3600,
      },
      storage: {
        apiKey: process.env.BUNNY_SIGNED_STORAGE_API_KEY || '',
        hostname: process.env.BUNNY_SIGNED_STORAGE_HOSTNAME || '',
        tokenSecurityKey: process.env.BUNNY_SIGNED_STORAGE_TOKEN_SECURITY_KEY || '',
        zoneName: process.env.BUNNY_SIGNED_STORAGE_ZONE_NAME || '',
      },
      stream: {
        apiKey: process.env.BUNNY_SIGNED_STREAM_API_KEY || '',
        hostname: process.env.BUNNY_SIGNED_STREAM_HOSTNAME || '',
        libraryId: parseInt(process.env.BUNNY_SIGNED_STREAM_LIBRARY_ID || '0', 10),
        tokenSecurityKey: process.env.BUNNY_SIGNED_STREAM_TOKEN_SECURITY_KEY || '',
      },
    }),
  ],
} as Config)
