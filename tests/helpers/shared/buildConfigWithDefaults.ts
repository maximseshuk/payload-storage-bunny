import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { en } from '@payloadcms/translations/languages/en'
import type { CollectionConfig, Config, SanitizedConfig } from 'payload'
import { buildConfig } from 'payload'
import { de } from 'payload/i18n/de'
import { ru } from 'payload/i18n/ru'
import sharp from 'sharp'

export const devUser = {
  email: 'dev@example.com',
  password: 'test',
}

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  fields: [],
}

export const buildConfigWithDefaults = async (config?: Partial<Config>): Promise<SanitizedConfig> => {
  const finalConfig: Config = {
    admin: {
      autoLogin: {
        email: devUser.email,
        password: devUser.password,
      },
    },
    collections: [Users, ...(config?.collections || [])],
    db: mongooseAdapter({
      collation: {
        strength: 1,
      },
      ensureIndexes: true,
      mongoMemoryServer: (global as any)._mongoMemoryServer,
      url:
        process.env.MONGODB_MEMORY_SERVER_URI ||
        process.env.DATABASE_URI ||
        'mongodb://127.0.0.1/payload-storage-bunny',
    }),
    i18n: {
      supportedLanguages: {
        de,
        en,
        ru,
        ...(config?.i18n?.supportedLanguages || {}),
      },
      ...(config?.i18n || {}),
    },
    onInit: async (payload) => {
      const existingUser = await payload.find({
        collection: 'users',
        where: {
          email: {
            equals: devUser.email,
          },
        },
      })

      if (existingUser.docs.length > 0) {
        return
      }

      await payload.create({
        collection: 'users',
        data: devUser,
      })
    },
    secret: process.env.PAYLOAD_SECRET || 'test-secret-key',
    sharp,
    telemetry: false,
    typescript: {
      autoGenerate: false,
      declare: {
        ignoreTSError: true,
        ...(config?.typescript?.declare || {}),
      },
      ...(config?.typescript || {}),
    },
    ...config,
  }

  return await buildConfig(finalConfig)
}
