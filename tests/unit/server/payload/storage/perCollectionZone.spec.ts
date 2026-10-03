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

vi.mock('@/server/bunny/stream.js', () => ({
  createStreamVideo: createStreamVideoMock,
  deleteStreamVideo: deleteStreamVideoMock,
  uploadStreamVideo: uploadStreamVideoMock,
}))

vi.mock('@/server/bunny/storage.js', () => ({
  deleteStorageFile: deleteStorageFileMock,
  uploadStorageFile: uploadStorageFileMock,
}))

vi.mock('@/server/bunny/s3.js', () => ({
  deleteStorageFileS3: deleteStorageFileS3Mock,
  uploadStorageFileS3: uploadStorageFileS3Mock,
}))

vi.mock('@/server/bunny/cdn.js', () => ({
  purgeCache: vi.fn(),
}))

vi.mock('@/server/payload/tokenAuth.js', () => ({
  maybeGenerateSignedUrl: maybeGenerateSignedUrlMock,
}))

const { getGenerateUrl, getHandleDelete, getHandleUpload } = await import('@/server/payload/storage/index.js')
const { createCollectionContext } = await import('@/server/payload/config/context.js')
const { createNormalizedConfig } = await import('@/server/payload/config/normalizer.js')

const { createBaseStorage, createBaseStream, createOwnStorage, createOwnStream } =
  await import('../../../../helpers/unit/configBuilders.js')
const { createReq } = await import('../../../../helpers/unit/req.js')

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
    it('uploads each collection to its own zone: HTTP override, S3 override, global sibling', async () => {
      const file = {
        buffer: Buffer.from('x'),
        filename: 'photo.jpg',
        filesize: 1,
        mimeType: 'image/jpeg',
      }
      const upload = (slug: string) =>
        getHandleUpload(contextFor(slug))({ collection: { slug }, data: {}, file, req: createReq() } as never)

      await upload('own')
      expect(uploadStorageFileMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ apiKey: 'own-storage-key-own', zoneName: 'own-zone-own' }),
      )

      await upload('ownS3')
      expect(uploadStorageFileS3Mock).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'own-storage-key-s3', s3: { region: 'ny' }, zoneName: 'own-zone-s3' }),
      )

      await upload('sibling')
      expect(uploadStorageFileMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ apiKey: 'storage-key', zoneName: 'test-zone' }),
      )
      expect(uploadStorageFileMock).toHaveBeenCalledTimes(2)
      expect(uploadStorageFileS3Mock).toHaveBeenCalledTimes(1)
    })

    it('creates the Stream video in the override collection library', async () => {
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
    it('deletes each collection file from its own zone: HTTP override, S3 override, global sibling', async () => {
      const remove = (slug: string) =>
        getHandleDelete(contextFor(slug))({
          collection: { slug },
          doc: { filename: 'photo.jpg', id: slug },
          filename: 'photo.jpg',
          req: createReq(),
        } as never)

      await remove('own')
      expect(deleteStorageFileMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ apiKey: 'own-storage-key-own', zoneName: 'own-zone-own' }),
      )

      await remove('ownS3')
      expect(deleteStorageFileS3Mock).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'own-storage-key-s3', s3: { region: 'ny' }, zoneName: 'own-zone-s3' }),
      )

      await remove('sibling')
      expect(deleteStorageFileMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ apiKey: 'storage-key', zoneName: 'test-zone' }),
      )
      expect(deleteStorageFileMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('generateURL', () => {
    const generate = (slug: string, args: { data: unknown; filename: string }) =>
      (getGenerateUrl(contextFor(slug)) as unknown as (a: typeof args) => string)(args)

    it('builds storage and stream URLs from each collection hostname', () => {
      expect(generate('own', { data: {}, filename: 'photo.jpg' })).toBe('https://own-own.b-cdn.net/photo.jpg')
      expect(generate('sibling', { data: {}, filename: 'photo.jpg' })).toBe('https://storage.bunny.net/photo.jpg')
      expect(generate('own', { data: { bunnyData: { stream: { videoId: 'guid-1' } } }, filename: 'clip.mp4' })).toBe(
        'https://own-stream-777.b-cdn.net/guid-1/playlist.m3u8',
      )
    })
  })
})
