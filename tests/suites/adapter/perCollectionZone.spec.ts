import type { CollectionConfig } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createStreamVideoMock,
  deleteStorageFileMock,
  deleteStorageFileS3Mock,
  deleteStreamVideoMock,
  maybeGenerateSignedUrlMock,
  uploadStorageFileMock,
  uploadStorageFileS3Mock,
  uploadStreamVideoMock,
} = vi.hoisted(() => ({
  createStreamVideoMock: vi.fn(),
  deleteStorageFileMock: vi.fn(),
  deleteStorageFileS3Mock: vi.fn(),
  deleteStreamVideoMock: vi.fn(),
  maybeGenerateSignedUrlMock: vi.fn(),
  uploadStorageFileMock: vi.fn(),
  uploadStorageFileS3Mock: vi.fn(),
  uploadStreamVideoMock: vi.fn(),
}))

vi.mock('@/stream/api.js', () => ({
  createStreamVideo: createStreamVideoMock,
  deleteStreamVideo: deleteStreamVideoMock,
  uploadStreamVideo: uploadStreamVideoMock,
}))

vi.mock('@/storage/api.js', () => ({
  deleteStorageFile: deleteStorageFileMock,
  uploadStorageFile: uploadStorageFileMock,
}))

vi.mock('@/storage/s3.js', () => ({
  deleteStorageFileS3: deleteStorageFileS3Mock,
  uploadStorageFileS3: uploadStorageFileS3Mock,
}))

vi.mock('@/cdn/purge.js', () => ({
  purgeCache: vi.fn(),
}))

vi.mock('@/cdn/tokenAuth.js', () => ({
  maybeGenerateSignedUrl: maybeGenerateSignedUrlMock,
}))

const { getGenerateUrl, getHandleDelete, getHandleUpload } = await import('@/adapter/index.js')
const { createCollectionContext } = await import('@/config/context.js')
const { createNormalizedConfig } = await import('@/config/normalizer.js')

const { createBaseStorage, createBaseStream, createOwnStorage, createOwnStream } =
  await import('../../helpers/unit/configBuilders.js')

const t = (key: string, vars?: Record<string, unknown>): string => (vars ? `${key}:${JSON.stringify(vars)}` : key)
const createReq = () => ({ payload: { logger: { debug: vi.fn(), error: vi.fn() } }, t })

const config = createNormalizedConfig({
  collections: {
    own: {
      disablePayloadAccessControl: true,
      storage: createOwnStorage('own'),
      stream: createOwnStream(777),
    },
    ownS3: {
      disablePayloadAccessControl: true,
      storage: createOwnStorage('s3', { s3: { region: 'ny' } }),
      stream: false,
    },
    sibling: { disablePayloadAccessControl: true },
  },
  storage: createBaseStorage(),
  stream: createBaseStream(),
} as never)

const contextFor = (slug: string) => createCollectionContext(config, { fields: [], slug } as CollectionConfig)

beforeEach(() => {
  vi.clearAllMocks()
  maybeGenerateSignedUrlMock.mockImplementation((url: string) => url)
  createStreamVideoMock.mockResolvedValue({ guid: 'guid-1', videoLibraryId: 777 })
  uploadStreamVideoMock.mockResolvedValue(undefined)
})

describe('per-collection zone routing through the adapter', () => {
  describe('handleUpload', () => {
    it('uploads an override collection to its own storage zone and the sibling to the global zone', async () => {
      const file = {
        buffer: Buffer.from('x'),
        filename: 'photo.jpg',
        filesize: 1,
        mimeType: 'image/jpeg',
      }

      await getHandleUpload(contextFor('own'))({
        collection: { slug: 'own' },
        data: {},
        file,
        req: createReq(),
      } as never)
      expect(uploadStorageFileMock).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'own-storage-key-own', zoneName: 'own-zone-own' }),
      )

      uploadStorageFileMock.mockClear()

      await getHandleUpload(contextFor('sibling'))({
        collection: { slug: 'sibling' },
        data: {},
        file,
        req: createReq(),
      } as never)
      expect(uploadStorageFileMock).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'storage-key', zoneName: 'test-zone' }),
      )
    })

    it('routes an s3-backed override collection through uploadStorageFileS3 to its own zone', async () => {
      const file = {
        buffer: Buffer.from('x'),
        filename: 'photo.jpg',
        filesize: 1,
        mimeType: 'image/jpeg',
      }

      await getHandleUpload(contextFor('ownS3'))({
        collection: { slug: 'ownS3' },
        data: {},
        file,
        req: createReq(),
      } as never)

      expect(uploadStorageFileS3Mock).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'own-storage-key-s3',
          s3: { region: 'ny' },
          zoneName: 'own-zone-s3',
        }),
      )
      expect(uploadStorageFileMock).not.toHaveBeenCalled()

      await getHandleUpload(contextFor('sibling'))({
        collection: { slug: 'sibling' },
        data: {},
        file,
        req: createReq(),
      } as never)

      expect(uploadStorageFileMock).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'storage-key', zoneName: 'test-zone' }),
      )
      expect(uploadStorageFileS3Mock).toHaveBeenCalledTimes(1)
    })

    it('creates the stream video in the override collection library', async () => {
      const file = {
        buffer: Buffer.from('x'),
        filename: 'clip.mp4',
        filesize: 1,
        mimeType: 'video/mp4',
      }

      await getHandleUpload(contextFor('own'))({
        collection: { slug: 'own' },
        data: {},
        file,
        req: createReq(),
      } as never)

      expect(createStreamVideoMock).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'own-stream-key-777', libraryId: 777 }),
      )
    })
  })

  describe('handleDelete', () => {
    it('deletes an override collection file from its own zone and the sibling from the global zone', async () => {
      await getHandleDelete(contextFor('own'))({
        collection: { slug: 'own' },
        doc: { filename: 'photo.jpg', id: '1' },
        filename: 'photo.jpg',
        req: createReq(),
      } as never)
      expect(deleteStorageFileMock).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'own-storage-key-own', zoneName: 'own-zone-own' }),
      )

      deleteStorageFileMock.mockClear()

      await getHandleDelete(contextFor('sibling'))({
        collection: { slug: 'sibling' },
        doc: { filename: 'photo.jpg', id: '2' },
        filename: 'photo.jpg',
        req: createReq(),
      } as never)
      expect(deleteStorageFileMock).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'storage-key', zoneName: 'test-zone' }),
      )
    })

    it('deletes an s3-backed override collection file through deleteStorageFileS3 from its own zone', async () => {
      await getHandleDelete(contextFor('ownS3'))({
        collection: { slug: 'ownS3' },
        doc: { filename: 'photo.jpg', id: '3' },
        filename: 'photo.jpg',
        req: createReq(),
      } as never)

      expect(deleteStorageFileS3Mock).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'own-storage-key-s3',
          s3: { region: 'ny' },
          zoneName: 'own-zone-s3',
        }),
      )
      expect(deleteStorageFileMock).not.toHaveBeenCalled()
    })
  })

  describe('generateURL', () => {
    const generate = (slug: string, args: { data: unknown; filename: string }) =>
      (getGenerateUrl(contextFor(slug)) as unknown as (a: typeof args) => string)(args)

    it('builds storage URLs from each collection hostname', () => {
      expect(generate('own', { data: {}, filename: 'photo.jpg' })).toBe('https://own-own.b-cdn.net/photo.jpg')
      expect(generate('sibling', { data: {}, filename: 'photo.jpg' })).toBe('https://storage.bunny.net/photo.jpg')
    })

    it('builds the stream playlist URL from the override collection hostname', () => {
      const result = generate('own', { data: { bunnyData: { stream: { videoId: 'guid-1' } } }, filename: 'clip.mp4' })
      expect(result).toBe('https://own-stream-777.b-cdn.net/guid-1/playlist.m3u8')
    })
  })
})
