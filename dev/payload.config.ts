import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { de } from '@payloadcms/translations/languages/de'
import { en } from '@payloadcms/translations/languages/en'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { bunnyStorage } from '../src/index.js'
import { MediaBasic } from './collections/MediaBasic.js'
import { MediaProtected } from './collections/MediaProtected.js'
import { MediaSecure } from './collections/MediaSecure.js'
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
  collections: [Users, MediaBasic, MediaSecure, MediaProtected],
  db: mongooseAdapter({
    url: process.env.DATABASE_URI || '',
  }),
  i18n: {
    supportedLanguages: { de, en },
  },
  jobs: {
    autoRun: [
      {
        cron: '* * * * *',
        queue: 'storage-bunny',
      },
    ],
  },
  onInit: async (payload) => {
    await seed(payload)
  },
  plugins: [
    bunnyStorage({
      apiKey: process.env.BUNNY_API_KEY || '',
      collections: {
        mediaBasic: {
          disablePayloadAccessControl: true,
          prefix: 'basic',
          signedUrls: true,
          stream: false,
          thumbnail: {
            streamAnimated: true,
          },
        },
        mediaProtected: {
          prefix: 'protected',
          signedUrls: false,
          stream: {
            mp4Fallback: true,
            thumbnailTime: 3000,
          },
          thumbnail: {
            transformUrl: ({ baseUrl, data }) => {
              const timestamp = Date.now()
              const customId = data?.id as string || 'unknown'
              return `${baseUrl}?secure_thumb=true&id=${customId}&t=${timestamp}`
            },
          },
        },
        mediaSecure: {
          disablePayloadAccessControl: true,
          prefix: 'secure',
          purge: {
            async: false,
          },
          signedUrls: {
            expiresIn: 3600,
          },
          stream: {
            mimeTypes: ['video/*'],
          },
          thumbnail: false,
          urlTransform: {
            transformUrl: ({ baseUrl, data }) => {
              const isVideo = typeof data?.mimeType === 'string' && data.mimeType.startsWith('video/')
              const quality = isVideo ? 'hd' : 'original'
              const sessionId = Math.random().toString(36).substr(2, 9)
              return `${baseUrl}?quality=${quality}&session=${sessionId}&secure=true`
            },
          },
        },
      },
      enabled: true,
      experimental: { },
      i18n: {
        translations: {
          en: {
            tusUploadEnableMode: 'Enable tus mode',
          },
        },
      },
      mediaPreview: {
        contentMode: {
          document: 'newTab',
        },
        mode: 'auto',
      },
      purge: true,
      signedUrls: true,
      storage: {
        apiKey: process.env.BUNNY_STORAGE_API_KEY || '',
        hostname: process.env.BUNNY_STORAGE_HOSTNAME || '',
        tokenSecurityKey: process.env.BUNNY_STORAGE_TOKEN_SECURITY_KEY || '',
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
        tokenSecurityKey: process.env.BUNNY_STREAM_TOKEN_SECURITY_KEY || '',
        tus: true,
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
  secret: process.env.PAYLOAD_SECRET || '',
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
