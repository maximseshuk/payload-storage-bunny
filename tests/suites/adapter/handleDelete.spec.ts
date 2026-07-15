import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CollectionContext } from '@/types/index.js'

const { deleteStorageFileMock, deleteStorageFileS3Mock, deleteStreamVideoMock, purgeCacheMock } = vi.hoisted(() => ({
  deleteStorageFileMock: vi.fn(),
  deleteStorageFileS3Mock: vi.fn(),
  deleteStreamVideoMock: vi.fn(),
  purgeCacheMock: vi.fn(),
}))

vi.mock('@/stream/api.js', () => ({
  deleteStreamVideo: deleteStreamVideoMock,
}))

vi.mock('@/storage/api.js', () => ({
  deleteStorageFile: deleteStorageFileMock,
}))

vi.mock('@/storage/s3.js', () => ({
  deleteStorageFileS3: deleteStorageFileS3Mock,
}))

vi.mock('@/cdn/purge.js', () => ({
  purgeCache: purgeCacheMock,
}))

const { getHandleDelete } = await import('@/adapter/handleDelete.js')

const t = (key: string, vars?: Record<string, unknown>): string => (vars ? `${key}:${JSON.stringify(vars)}` : key)

const createReq = () => ({
  payload: {
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
    },
  },
  t,
})

const streamConfig = {
  apiKey: 'stream-key',
  hostname: 'stream.b-cdn.net',
  libraryId: 12345,
  tokenSecurityKey: 'stream-token',
}

const storageConfig = {
  apiKey: 'storage-key',
  hostname: 'storage.b-cdn.net',
  region: 'de',
  tokenSecurityKey: 'storage-token',
  zoneName: 'my-zone',
}

const buildContext = (overrides: Partial<CollectionContext> = {}): CollectionContext =>
  ({
    accountApiKey: 'account-key',
    collection: { slug: 'media' },
    ...overrides,
  }) as unknown as CollectionContext

const streamDoc = { bunnyData: { stream: { videoId: 'video-guid' } }, filename: 'clip.mp4', id: '1' }
const storageDoc = { filename: 'photo.jpg', id: '2' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getHandleDelete', () => {
  describe('stream documents', () => {
    it('deletes the stream video and skips storage/purge', async () => {
      deleteStreamVideoMock.mockResolvedValue(undefined)

      const handler = getHandleDelete(
        buildContext({ purgeConfig: { async: false }, streamConfig } as Partial<CollectionContext>),
      )

      await handler({
        collection: { slug: 'media' },
        doc: streamDoc,
        filename: 'clip.mp4',
        req: createReq(),
      } as never)

      expect(deleteStreamVideoMock).toHaveBeenCalledWith({
        apiKey: 'stream-key',
        libraryId: 12345,
        videoId: 'video-guid',
      })
      expect(deleteStorageFileMock).not.toHaveBeenCalled()
      expect(deleteStorageFileS3Mock).not.toHaveBeenCalled()
      expect(purgeCacheMock).not.toHaveBeenCalled()
    })
  })

  describe('storage documents', () => {
    it('deletes via the s3 backend when s3 config is present', async () => {
      deleteStorageFileS3Mock.mockResolvedValue(undefined)

      const s3 = { region: 'de' }
      const handler = getHandleDelete(
        buildContext({ storageConfig: { ...storageConfig, s3 } } as Partial<CollectionContext>),
      )

      await handler({
        collection: { slug: 'media' },
        doc: { ...storageDoc, prefix: 'uploads' },
        filename: 'photo.jpg',
        req: createReq(),
      } as never)

      expect(deleteStorageFileS3Mock).toHaveBeenCalledWith({
        apiKey: 'storage-key',
        path: 'uploads/photo.jpg',
        s3,
        zoneName: 'my-zone',
      })
      expect(deleteStorageFileMock).not.toHaveBeenCalled()
      expect(purgeCacheMock).not.toHaveBeenCalled()
    })

    it('deletes via the HTTP backend and purges when purgeConfig, accountApiKey and a fileUrl are present', async () => {
      deleteStorageFileMock.mockResolvedValue(undefined)
      purgeCacheMock.mockResolvedValue(undefined)

      const req = createReq()
      const handler = getHandleDelete(
        buildContext({ purgeConfig: { async: true }, storageConfig } as Partial<CollectionContext>),
      )

      await handler({
        collection: { slug: 'media' },
        doc: storageDoc,
        filename: 'photo.jpg',
        req,
      } as never)

      expect(deleteStorageFileMock).toHaveBeenCalledWith({
        apiKey: 'storage-key',
        path: 'photo.jpg',
        region: 'de',
        zoneName: 'my-zone',
      })
      expect(purgeCacheMock).toHaveBeenCalledWith({
        apiKey: 'account-key',
        async: true,
        url: 'https://storage.b-cdn.net/photo.jpg',
      })
      expect(req.payload.logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ msg: '[bunny:storage] delete: cache purged' }),
      )
    })

    it('does not purge when purgeConfig is absent', async () => {
      deleteStorageFileMock.mockResolvedValue(undefined)

      const handler = getHandleDelete(buildContext({ storageConfig } as Partial<CollectionContext>))

      await handler({
        collection: { slug: 'media' },
        doc: storageDoc,
        filename: 'photo.jpg',
        req: createReq(),
      } as never)

      expect(deleteStorageFileMock).toHaveBeenCalled()
      expect(purgeCacheMock).not.toHaveBeenCalled()
    })
  })

  describe('no configuration', () => {
    it('debug-logs and performs no work when neither storage nor stream is configured', async () => {
      const req = createReq()
      const handler = getHandleDelete(buildContext())

      await handler({
        collection: { slug: 'media' },
        doc: storageDoc,
        filename: 'photo.jpg',
        req,
      } as never)

      expect(deleteStorageFileMock).not.toHaveBeenCalled()
      expect(deleteStorageFileS3Mock).not.toHaveBeenCalled()
      expect(deleteStreamVideoMock).not.toHaveBeenCalled()
      expect(purgeCacheMock).not.toHaveBeenCalled()
      expect(req.payload.logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ msg: '[bunny:storage] delete: skipping, no storage or stream config' }),
      )
    })
  })

  describe('error handling', () => {
    it('wraps a failed delete in the delete-failed APIError and logs it', async () => {
      deleteStorageFileMock.mockRejectedValue(new Error('network down'))

      const req = createReq()
      const handler = getHandleDelete(buildContext({ storageConfig } as Partial<CollectionContext>))

      await expect(
        handler({
          collection: { slug: 'media' },
          doc: storageDoc,
          filename: 'photo.jpg',
          req,
        } as never),
      ).rejects.toThrow('@seshuk/payload-storage-bunny:errorDeleteFileFailed')

      expect(req.payload.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ msg: '[bunny:storage] delete: failed', storage: 'my-zone' }),
      )
    })
  })
})
