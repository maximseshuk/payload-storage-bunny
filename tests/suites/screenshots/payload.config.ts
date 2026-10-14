import type { Config } from 'payload'

import { bunnyStorage } from '@/index.js'

import { buildConfigWithDefaults } from '../../helpers/shared/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/shared/createMediaCollection.js'

export default buildConfigWithDefaults({
  collections: [
    createMediaCollection({
      slug: 'media',
      admin: { defaultColumns: ['filename', 'alt', 'bunnyStream', 'filesize', 'updatedAt'] },
      upload: { mimeTypes: ['image/*', 'video/*'] },
    }),
  ],
  storage: [
    bunnyStorage({
      collections: {
        media: {
          prefix: 'media',
          signedUrls: false,
          stream: { mp4Fallback: true },
          thumbnail: true,
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
        cleanup: false,
        hostname: process.env.BUNNY_STREAM_HOSTNAME || '',
        libraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || ''),
        referer: `https://${process.env.BUNNY_STREAM_HOSTNAME || ''}/`,
        tus: true,
      },
    }),
  ],
} as Config)
