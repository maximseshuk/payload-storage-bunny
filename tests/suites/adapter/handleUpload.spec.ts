import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CollectionContext } from '@/types/index.js'

const {
  createStreamVideoMock,
  createStreamVideoSessionMock,
  purgeCacheMock,
  uploadStorageFileMock,
  uploadStorageFileS3Mock,
  uploadStreamVideoMock,
} = vi.hoisted(() => ({
  createStreamVideoMock: vi.fn(),
  createStreamVideoSessionMock: vi.fn(),
  purgeCacheMock: vi.fn(),
  uploadStorageFileMock: vi.fn(),
  uploadStorageFileS3Mock: vi.fn(),
  uploadStreamVideoMock: vi.fn(),
}))

vi.mock('@/stream/api.js', () => ({
  createStreamVideo: createStreamVideoMock,
  uploadStreamVideo: uploadStreamVideoMock,
}))

vi.mock('@/stream/sessionsCollection.js', () => ({
  createStreamVideoSession: createStreamVideoSessionMock,
}))

vi.mock('@/storage/api.js', () => ({
  uploadStorageFile: uploadStorageFileMock,
}))

vi.mock('@/storage/s3.js', () => ({
  uploadStorageFileS3: uploadStorageFileS3Mock,
}))

vi.mock('@/cdn/purge.js', () => ({
  purgeCache: purgeCacheMock,
}))

const { getHandleUpload } = await import('@/adapter/handleUpload.js')

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

const createFile = (overrides: Record<string, unknown> = {}) => ({
  buffer: Buffer.from('binary-content'),
  filename: 'photo.jpg',
  filesize: 1234,
  mimeType: 'image/jpeg',
  ...overrides,
})

const streamConfig = {
  apiKey: 'stream-key',
  cleanup: false,
  hostname: 'stream.b-cdn.net',
  libraryId: 12345,
  mimeTypes: ['video/*'],
  thumbnailTime: 5000,
  tokenSecurityKey: 'stream-token',
  uploadTimeout: 300000,
}

const storageConfig = {
  apiKey: 'storage-key',
  hostname: 'storage.b-cdn.net',
  region: 'de',
  tokenSecurityKey: 'storage-token',
  uploadTimeout: 60000,
  zoneName: 'my-zone',
}

const buildContext = (overrides: Partial<CollectionContext> = {}): CollectionContext =>
  ({
    accountApiKey: 'account-key',
    collection: { slug: 'media' },
    ...overrides,
  }) as unknown as CollectionContext

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getHandleUpload', () => {
  describe('client uploads', () => {
    it('short-circuits when clientUploadContext is present', async () => {
      const handler = getHandleUpload(buildContext({ storageConfig } as unknown as Partial<CollectionContext>))
      const data: Record<string, unknown> = {}

      const result = await handler({
        clientUploadContext: { some: 'ctx' },
        collection: { slug: 'media' },
        data,
        file: createFile(),
        req: createReq(),
      } as never)

      expect(result).toBe(data)
      expect((data.bunnyData as { stream: { videoId: unknown } }).stream.videoId).toBeNull()
      expect(uploadStorageFileMock).not.toHaveBeenCalled()
      expect(createStreamVideoMock).not.toHaveBeenCalled()
    })
  })

  describe('stream path', () => {
    it('creates and uploads a stream video for a matching mime type (no cleanup)', async () => {
      createStreamVideoMock.mockResolvedValue({ guid: 'video-guid', videoLibraryId: 12345 })
      uploadStreamVideoMock.mockResolvedValue(undefined)

      const handler = getHandleUpload(buildContext({ streamConfig } as unknown as Partial<CollectionContext>))
      const data: Record<string, unknown> = {}
      const file = createFile({ filename: 'clip.mp4', mimeType: 'video/mp4' })

      const result = await handler({
        collection: { slug: 'media' },
        data,
        file,
        req: createReq(),
      } as never)

      expect(createStreamVideoMock).toHaveBeenCalledWith({
        apiKey: 'stream-key',
        libraryId: 12345,
        thumbnailTime: 5000,
        title: 'clip.mp4',
      })
      expect(uploadStreamVideoMock).toHaveBeenCalledWith({
        apiKey: 'stream-key',
        buffer: file.buffer,
        libraryId: 12345,
        timeout: 300000,
        videoId: 'video-guid',
      })
      expect(createStreamVideoSessionMock).not.toHaveBeenCalled()
      expect((data.bunnyData as { stream: { videoId: unknown } }).stream.videoId).toBe('video-guid')
      expect(result).toBe(data)
    })

    it('creates a tracking session when cleanup is enabled', async () => {
      createStreamVideoMock.mockResolvedValue({ guid: 'video-guid', videoLibraryId: 999 })
      uploadStreamVideoMock.mockResolvedValue(undefined)
      createStreamVideoSessionMock.mockResolvedValue({ id: 'session-1' })

      const req = createReq()
      const handler = getHandleUpload(
        buildContext({ streamConfig: { ...streamConfig, cleanup: true } } as unknown as Partial<CollectionContext>),
      )

      await handler({
        collection: { slug: 'media' },
        data: {},
        file: createFile({ filename: 'clip.mp4', mimeType: 'video/mp4' }),
        req,
      } as never)

      expect(createStreamVideoSessionMock).toHaveBeenCalledWith({
        libraryId: 999,
        payload: req.payload,
        videoId: 'video-guid',
      })
    })
  })

  describe('storage path', () => {
    it('uploads via the HTTP backend when no s3 config is present', async () => {
      uploadStorageFileMock.mockResolvedValue(undefined)

      const handler = getHandleUpload(buildContext({ storageConfig } as unknown as Partial<CollectionContext>))
      const data: Record<string, unknown> = {}
      const file = createFile()

      await handler({
        collection: { slug: 'media' },
        data,
        file,
        req: createReq(),
      } as never)

      expect(uploadStorageFileMock).toHaveBeenCalledWith({
        apiKey: 'storage-key',
        buffer: file.buffer,
        mimeType: 'image/jpeg',
        path: 'photo.jpg',
        region: 'de',
        timeout: 60000,
        zoneName: 'my-zone',
      })
      expect(uploadStorageFileS3Mock).not.toHaveBeenCalled()
      expect((data.bunnyData as { stream: { videoId: unknown } }).stream.videoId).toBeNull()
      expect(purgeCacheMock).not.toHaveBeenCalled()
    })

    it('uploads via the s3 backend when s3 config is present', async () => {
      uploadStorageFileS3Mock.mockResolvedValue(undefined)

      const s3 = { region: 'de' }
      const handler = getHandleUpload(
        buildContext({ storageConfig: { ...storageConfig, s3 } } as unknown as Partial<CollectionContext>),
      )
      const file = createFile({ filename: 'doc.pdf', mimeType: 'application/pdf' })

      await handler({
        collection: { slug: 'media' },
        data: {},
        file,
        req: createReq(),
      } as never)

      expect(uploadStorageFileS3Mock).toHaveBeenCalledWith({
        apiKey: 'storage-key',
        buffer: file.buffer,
        mimeType: 'application/pdf',
        path: 'doc.pdf',
        s3,
        timeout: 60000,
        zoneName: 'my-zone',
      })
      expect(uploadStorageFileMock).not.toHaveBeenCalled()
    })

    it('joins the prefix into the upload path', async () => {
      uploadStorageFileMock.mockResolvedValue(undefined)

      const handler = getHandleUpload(
        buildContext({ prefix: 'uploads', storageConfig } as unknown as Partial<CollectionContext>),
      )

      await handler({
        collection: { slug: 'media' },
        data: {},
        file: createFile(),
        req: createReq(),
      } as never)

      expect(uploadStorageFileMock.mock.calls[0][0].path).toBe('uploads/photo.jpg')
    })
  })

  describe('purge after upload', () => {
    it('purges the cache when purgeConfig and accountApiKey are present', async () => {
      uploadStorageFileMock.mockResolvedValue(undefined)
      purgeCacheMock.mockResolvedValue(undefined)

      const req = createReq()
      const handler = getHandleUpload(
        buildContext({ purgeConfig: { async: false }, storageConfig } as unknown as Partial<CollectionContext>),
      )

      const result = await handler({
        collection: { slug: 'media' },
        data: {},
        file: createFile(),
        req,
      } as never)

      expect(purgeCacheMock).toHaveBeenCalledWith({
        apiKey: 'account-key',
        async: false,
        url: 'https://storage.b-cdn.net/photo.jpg',
      })
      expect(req.payload.logger.debug).toHaveBeenCalled()
      expect(result).toBeTruthy()
    })

    it('swallows and logs purge failures without failing the upload', async () => {
      uploadStorageFileMock.mockResolvedValue(undefined)
      purgeCacheMock.mockRejectedValue(new Error('purge boom'))

      const req = createReq()
      const handler = getHandleUpload(
        buildContext({ purgeConfig: { async: false }, storageConfig } as unknown as Partial<CollectionContext>),
      )
      const data: Record<string, unknown> = {}

      const result = await handler({
        collection: { slug: 'media' },
        data,
        file: createFile(),
        req,
      } as never)

      expect(result).toBe(data)
      expect(purgeCacheMock).toHaveBeenCalled()
      expect(req.payload.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ msg: '[bunny:storage] upload: cache purge failed' }),
      )
    })

    it('does not purge when accountApiKey is missing even if purgeConfig is set', async () => {
      uploadStorageFileMock.mockResolvedValue(undefined)

      const handler = getHandleUpload(
        buildContext({
          accountApiKey: undefined,
          purgeConfig: { async: false },
          storageConfig,
        } as unknown as Partial<CollectionContext>),
      )

      await handler({
        collection: { slug: 'media' },
        data: {},
        file: createFile(),
        req: createReq(),
      } as never)

      expect(purgeCacheMock).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('throws the upload-failed APIError (logging the no-service cause) when neither storage nor stream is configured', async () => {
      const req = createReq()
      const handler = getHandleUpload(buildContext())

      await expect(
        handler({
          collection: { slug: 'media' },
          data: {},
          file: createFile(),
          req,
        } as never),
      ).rejects.toThrow('@seshuk/payload-storage-bunny:errorUploadFileFailed')

      const loggedErr = (req.payload.logger.error.mock.calls[0][0] as { err: Error }).err
      expect(loggedErr.message).toBe('@seshuk/payload-storage-bunny:errorNoServiceConfigured')
    })

    it('wraps a failed upload in the upload-failed APIError and logs it', async () => {
      uploadStorageFileMock.mockRejectedValue(new Error('network down'))

      const req = createReq()
      const handler = getHandleUpload(buildContext({ storageConfig } as unknown as Partial<CollectionContext>))

      await expect(
        handler({
          collection: { slug: 'media' },
          data: {},
          file: createFile(),
          req,
        } as never),
      ).rejects.toThrow('@seshuk/payload-storage-bunny:errorUploadFileFailed')

      expect(req.payload.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ msg: '[bunny:storage] upload: failed', storage: 'my-zone' }),
      )
    })
  })
})
