import type { Config } from 'payload'

import { bunnyStorage } from '../../../src/index.js'
import { buildConfigWithDefaults } from '../../helpers/shared/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/shared/createMediaCollection.js'
import { hasS3StorageCredentials } from '../../helpers/shared/credentials.js'

const withS3 = hasS3StorageCredentials()

export default buildConfigWithDefaults({
  collections: [
    createMediaCollection({ slug: 'client-uploads-edge', upload: { mimeTypes: ['image/*'] } }),
    ...(withS3 ? [createMediaCollection({ slug: 'client-uploads-s3', upload: { mimeTypes: ['image/*'] } })] : []),
  ],
  storage: [
    bunnyStorage({
      collections: {
        'client-uploads-edge': {
          prefix: 'client-uploads-edge',
        },
        ...(withS3 && {
          'client-uploads-s3': {
            prefix: 'client-uploads-s3',
            storage: {
              apiKey: process.env.BUNNY_S3_STORAGE_API_KEY || '',
              clientUploads: {},
              hostname: process.env.BUNNY_S3_STORAGE_HOSTNAME || '',
              s3: { region: process.env.BUNNY_S3_STORAGE_REGION || 'de' },
              zoneName: process.env.BUNNY_S3_STORAGE_ZONE_NAME || '',
            },
          },
        }),
      },
      enabled: true,
      storage: {
        apiKey: process.env.BUNNY_STORAGE_API_KEY || '',
        clientUploads: {
          edge: {
            scriptUrl: process.env.BUNNY_EDGE_SCRIPT_URL || 'https://uploader.invalid',
            secret: process.env.BUNNY_EDGE_SECRET || 'placeholder-secret',
          },
        },
        hostname: process.env.BUNNY_STORAGE_HOSTNAME || '',
        zoneName: process.env.BUNNY_STORAGE_ZONE_NAME || '',
      },
    }),
  ],
} as Config)
