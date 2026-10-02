import type { CollectionContext } from '@/shared/types/index.js'

export const streamConfig = {
  apiKey: 'stream-key',
  hostname: 'stream.b-cdn.net',
  libraryId: 12345,
  mimeTypes: ['video/*'],
  mp4Fallback: false,
  thumbnailTime: 5000,
  tokenSecurityKey: 'stream-token',
  uploadTimeout: 300000,
}

export const storageConfig = {
  apiKey: 'storage-key',
  hostname: 'storage.b-cdn.net',
  region: 'de',
  tokenSecurityKey: 'storage-token',
  uploadTimeout: 60000,
  zoneName: 'my-zone',
}

export const buildContext = (overrides: Record<string, unknown> = {}): CollectionContext =>
  ({
    accountApiKey: 'account-key',
    collection: { slug: 'media' },
    ...overrides,
  }) as unknown as CollectionContext
