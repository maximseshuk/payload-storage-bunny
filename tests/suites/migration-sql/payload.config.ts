import { sqliteAdapter } from '@payloadcms/db-sqlite'
import type { Config } from 'payload'

import { bunnyStorage } from '../../../src/index.js'
import { buildConfigWithDefaults } from '../../helpers/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/createMediaCollection.js'

export default buildConfigWithDefaults({
  collections: [createMediaCollection({ slug: 'migration-media-sql' })],
  db: sqliteAdapter({ client: { url: ':memory:' } }),
  plugins: [
    bunnyStorage({
      collections: {
        'migration-media-sql': {
          disablePayloadAccessControl: true,
          prefix: 'migration-media-sql',
          signedUrls: false,
        },
      },
      enabled: true,
      storage: {
        apiKey: 'test-storage-key',
        hostname: 'storage.example.com',
        zoneName: 'test-zone',
      },
      stream: {
        apiKey: 'test-stream-key',
        hostname: 'stream.example.com',
        libraryId: 12345,
        mp4Fallback: true,
      },
    }),
  ],
} as Config)
