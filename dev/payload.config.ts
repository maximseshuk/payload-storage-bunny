import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { bunnyStorage } from '@seshuk/payload-storage-bunny'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { Media } from './collections/Media.js'
import { Users } from './collections/Users.js'
import { devUser } from './helpers/credentials.js'
import { seed } from './seed.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

export default buildConfig({
  admin: {
    autoLogin: {
      email: devUser.email,
      password: devUser.password,
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
  },
  collections: [Users, Media],
  db: mongooseAdapter({
    url: process.env.DATABASE_URI || '',
  }),
  onInit: async (payload) => {
    await seed(payload)
  },
  plugins: [
    bunnyStorage({
      collections: {
        media: {
          disablePayloadAccessControl: true,
          prefix: 'media',
        },
      },
      enabled: true,
      experimental: {
        replaceSaveButtonComponent: true,
      },
      options: {
        adminThumbnail: {
          appendTimestamp: true,
          queryParams: {
            class: 'thumbnail',
          },
        },
        purge: {
          apiKey: process.env.BUNNY_API_KEY || '',
          async: true,
          enabled: true,
        },
        storage: {
          apiKey: process.env.BUNNY_STORAGE_API_KEY || '',
          hostname: process.env.BUNNY_STORAGE_HOSTNAME || '',
          zoneName: process.env.BUNNY_STORAGE_ZONE_NAME || '',
        },
        stream: {
          apiKey: process.env.BUNNY_STREAM_API_KEY || '',
          hostname: process.env.BUNNY_STREAM_HOSTNAME || '',
          libraryId: process.env.BUNNY_STREAM_LIBRARY_ID || '',
          thumbnailTime: 500,
        },
      },
    }),
  ],
  secret: process.env.PAYLOAD_SECRET || '',
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
