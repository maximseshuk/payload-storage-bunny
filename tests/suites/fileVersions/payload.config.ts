import { sharpTransformer } from '@payloadcms/transformer-sharp'
import type { Config } from 'payload'

import { bunnyStorage } from '@/index.js'

import { buildConfigWithDefaults } from '../../helpers/shared/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/shared/createMediaCollection.js'
import { hasS3StorageCredentials } from '../../helpers/shared/credentials.js'

const withS3 = hasS3StorageCredentials()
const video = { mimeTypes: ['video/mp4'] }
const preview = { variants: [{ name: 'preview', height: 400, width: 300 }] }

export default buildConfigWithDefaults({
  collections: [
    createMediaCollection({ lockDocuments: false, slug: 'fv-storage' }),
    createMediaCollection({ slug: 'fv-storage-pruned', versions: { maxPerDoc: 1 } }),
    createMediaCollection({ slug: 'fv-storage-unversioned', versions: false }),
    createMediaCollection({ lockDocuments: false, slug: 'fv-stream', upload: video }),
    createMediaCollection({ lockDocuments: false, slug: 'fv-stream-client' }),
    createMediaCollection({ slug: 'fv-stream-drafts', upload: video, versions: { drafts: { autosave: true } } }),
    createMediaCollection({ slug: 'fv-stream-pruned', upload: video, versions: { maxPerDoc: 1 } }),
    ...(withS3 ? [createMediaCollection({ lockDocuments: false, slug: 'fv-s3' })] : []),
  ],
  upload: {
    transformers: [
      sharpTransformer({
        collections: { 'fv-storage': preview, 'fv-storage-pruned': preview, 'fv-storage-unversioned': preview },
      }),
    ],
  },
  storage: [
    bunnyStorage({
      accountApiKey: process.env.BUNNY_ACCOUNT_API_KEY || '',
      collections: {
        'fv-storage': { disablePayloadAccessControl: true, prefix: 'fv-storage', stream: false },
        'fv-storage-pruned': { disablePayloadAccessControl: true, prefix: 'fv-storage-pruned', stream: false },
        'fv-storage-unversioned': {
          disablePayloadAccessControl: true,
          prefix: 'fv-storage-unversioned',
          purge: { async: false },
          stream: false,
        },
        'fv-stream': {
          disablePayloadAccessControl: true,
          prefix: 'fv-stream',
          storage: false,
          stream: { mimeTypes: ['video/*'], tus: true },
        },
        'fv-stream-client': {
          disablePayloadAccessControl: true,
          prefix: 'fv-stream-client',
          storage: false,
          stream: { mimeTypes: ['video/*'], tus: true },
        },
        'fv-stream-drafts': {
          disablePayloadAccessControl: true,
          prefix: 'fv-stream-drafts',
          storage: false,
          stream: { mimeTypes: ['video/*'], tus: true },
        },
        'fv-stream-pruned': {
          disablePayloadAccessControl: true,
          prefix: 'fv-stream-pruned',
          storage: false,
          stream: { mimeTypes: ['video/*'] },
        },
        ...(withS3 && {
          'fv-s3': {
            disablePayloadAccessControl: true,
            prefix: 'fv-s3',
            storage: {
              apiKey: process.env.BUNNY_S3_STORAGE_API_KEY || '',
              clientUploads: {},
              hostname: process.env.BUNNY_S3_STORAGE_HOSTNAME || '',
              region: process.env.BUNNY_S3_STORAGE_REGION || 'de',
              s3: true,
              zoneName: process.env.BUNNY_S3_STORAGE_ZONE_NAME || '',
            },
            stream: { mimeTypes: ['video/*'], tus: true },
          },
        }),
      },
      enabled: true,
      signedUrls: false,
      storage: {
        apiKey: process.env.BUNNY_STORAGE_API_KEY || '',
        hostname: process.env.BUNNY_STORAGE_HOSTNAME || '',
        zoneName: process.env.BUNNY_STORAGE_ZONE_NAME || '',
      },
      stream: {
        apiKey: process.env.BUNNY_STREAM_API_KEY || '',
        hostname: process.env.BUNNY_STREAM_HOSTNAME || '',
        libraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0', 10),
      },
    }),
  ],
} as Config)
