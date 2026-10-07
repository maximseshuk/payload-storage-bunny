import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CollectionContext } from '@/shared/types/index.js'

const {
  createStreamVideoMock,
  createStreamVideoSessionMock,
  getStreamVideoMock,
  purgeCacheMock,
  uploadStorageFileMock,
  uploadStorageFileS3Mock,
  uploadStreamVideoMock,
} = vi.hoisted(() => ({
  createStreamVideoMock: vi.fn(),
  createStreamVideoSessionMock: vi.fn(),
  getStreamVideoMock: vi.fn(),
  purgeCacheMock: vi.fn(),
  uploadStorageFileMock: vi.fn(),
  uploadStorageFileS3Mock: vi.fn(),
  uploadStreamVideoMock: vi.fn(),
}))

vi.mock('@/server/bunny/stream.js', async (importOriginal) => ({
  createStreamVideo: createStreamVideoMock,
  getStreamSaveState: (await importOriginal<typeof import('@/server/bunny/stream.js')>()).getStreamSaveState,
  getStreamVideo: getStreamVideoMock,
  uploadStreamVideo: uploadStreamVideoMock,
}))

vi.mock('@/server/payload/stream/sessionsCollection.js', () => ({
  createStreamVideoSession: createStreamVideoSessionMock,
}))

vi.mock('@/server/bunny/storage.js', () => ({
  uploadStorageFile: uploadStorageFileMock,
}))

vi.mock('@/server/bunny/s3.js', () => ({
  uploadStorageFileS3: uploadStorageFileS3Mock,
}))

vi.mock('@/server/bunny/cdn.js', () => ({
  purgeCache: purgeCacheMock,
}))

import { buildContext, storageOptions, streamOptions } from '../../../../helpers/unit/context.js'
import { createReq } from '../../../../helpers/unit/req.js'

const { buildUploadStoragePathData } = await import('@payloadcms/plugin-cloud-storage/utilities')
const { getForgetStreamVideoHook, getHandleUpload } = await import('@/server/payload/storage/handleUpload.js')

const createFile = (overrides: Record<string, unknown> = {}) => ({
  buffer: Buffer.from('binary-content'),
  filename: 'photo.jpg',
  filesize: 1234,
  mimeType: 'image/jpeg',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  getStreamVideoMock.mockResolvedValue({ guid: 'video-guid', status: 1 })
})

describe('getHandleUpload', () => {
  describe('stream path', () => {
    it('creates and uploads a Stream video for a matching MIME type without cleanup', async () => {
      createStreamVideoMock.mockResolvedValue({ guid: 'video-guid', videoLibraryId: 12345 })
      uploadStreamVideoMock.mockResolvedValue(undefined)

      const handler = getHandleUpload(buildContext({ streamOptions } as unknown as Partial<CollectionContext>))
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
      expect(getStreamVideoMock).toHaveBeenCalledWith({ apiKey: 'stream-key', libraryId: 12345, videoId: 'video-guid' })
      expect((data.bunnyData as { stream: unknown }).stream).toEqual({ status: 'processing', videoId: 'video-guid' })
      expect(result).toBe(data)
    })

    it('marks the new video as uploaded by the server, so field access lets the document store it', async () => {
      createStreamVideoMock.mockResolvedValue({ guid: 'video-guid', videoLibraryId: 12345 })
      const req = createReq() as { context?: Record<string, unknown> }

      await getHandleUpload(buildContext({ streamOptions } as unknown as Partial<CollectionContext>))({
        collection: { slug: 'media' },
        data: {},
        file: createFile({ filename: 'clip.mp4', mimeType: 'video/mp4' }),
        req,
      } as never)

      expect(req.context!.bunnyServerStreamUpload).toBe('video-guid')
    })

    it.each([
      ['clip-original.mp4', 'clip.mp4'],
      ['clip-original-2.mp4', 'clip.mp4'],
      ['clip-original', 'clip'],
      ['clip-1.mp4', 'clip-1.mp4'],
    ])('names the video %s as %s', async (filename, title) => {
      createStreamVideoMock.mockResolvedValue({ guid: 'video-guid', videoLibraryId: 12345 })

      await getHandleUpload(buildContext({ streamOptions } as unknown as Partial<CollectionContext>))({
        collection: { slug: 'media' },
        data: {},
        file: createFile({ filename, mimeType: 'video/mp4' }),
        req: createReq(),
      } as never)

      expect(createStreamVideoMock).toHaveBeenCalledWith(expect.objectContaining({ title }))
    })

    it('maps the storage key to the new video before the upload, so a failed upload can delete the video', async () => {
      createStreamVideoMock.mockResolvedValue({ guid: 'video-guid', videoLibraryId: 12345 })
      uploadStreamVideoMock.mockRejectedValueOnce(new Error('network down'))
      const req = createReq() as { context?: Record<string, unknown> }

      await expect(
        getHandleUpload(buildContext({ streamOptions } as unknown as Partial<CollectionContext>))({
          collection: { slug: 'media' },
          data: {},
          file: createFile({ filename: 'clip.mp4', mimeType: 'video/mp4' }),
          req,
          storageFilePath: 'media/a/clip.mp4',
        } as never),
      ).rejects.toThrow('@seshuk/payload-storage-bunny:errorUploadFileFailed')

      expect((req.context!.bunnyStreamKeys as Map<string, Map<string, string>>).get('media')).toEqual(
        new Map([['media/a/clip.mp4', 'video-guid']]),
      )
    })

    it('stores the state Bunny reports after the upload', async () => {
      createStreamVideoMock.mockResolvedValue({ guid: 'video-guid', videoLibraryId: 12345 })
      getStreamVideoMock.mockResolvedValue({ guid: 'video-guid', status: 5 })
      const data: Record<string, unknown> = {}

      await getHandleUpload(buildContext({ streamOptions } as unknown as Partial<CollectionContext>))({
        collection: { slug: 'media' },
        data,
        file: createFile({ filename: 'clip.mp4', mimeType: 'video/mp4' }),
        req: createReq(),
      } as never)

      expect((data.bunnyData as { stream: unknown }).stream).toEqual({ status: 'failed', videoId: 'video-guid' })
    })

    it('stores processing and logs when Bunny cannot report the state after the upload', async () => {
      createStreamVideoMock.mockResolvedValue({ guid: 'video-guid', videoLibraryId: 12345 })
      getStreamVideoMock.mockRejectedValue(new Error('timeout'))
      const data: Record<string, unknown> = {}
      const req = createReq()

      await getHandleUpload(buildContext({ streamOptions } as unknown as Partial<CollectionContext>))({
        collection: { slug: 'media' },
        data,
        file: createFile({ filename: 'clip.mp4', mimeType: 'video/mp4' }),
        req,
      } as never)

      expect((data.bunnyData as { stream: unknown }).stream).toEqual({ status: 'processing', videoId: 'video-guid' })
      expect(req.payload.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ msg: '[bunny:stream] upload: failed to read the video state' }),
      )
    })

    it.each([
      [
        'Bunny reports a video that is still encoding',
        () => getStreamVideoMock.mockResolvedValue({ guid: 'video-guid', status: 2 }),
      ],
      ['Bunny cannot report the state', () => getStreamVideoMock.mockRejectedValue(new Error('timeout'))],
    ])('replaces the old resolutions with null when %s and mp4Fallback is on', async (_label, arrange) => {
      createStreamVideoMock.mockResolvedValue({ guid: 'video-guid', videoLibraryId: 12345 })
      arrange()
      const data: Record<string, unknown> = {
        bunnyData: { stream: { resolutions: { available: ['720p'], highest: '720p' }, videoId: 'old-guid' } },
      }

      await getHandleUpload(
        buildContext({
          streamOptions: { ...streamOptions, mp4Fallback: true },
        } as unknown as Partial<CollectionContext>),
      )({
        collection: { slug: 'media' },
        data,
        file: createFile({ filename: 'clip.mp4', mimeType: 'video/mp4' }),
        req: createReq(),
      } as never)

      expect((data.bunnyData as { stream: unknown }).stream).toEqual({
        resolutions: null,
        status: 'processing',
        videoId: 'video-guid',
      })
    })

    it('does not ask Bunny for the state when the status is turned off', async () => {
      createStreamVideoMock.mockResolvedValue({ guid: 'video-guid', videoLibraryId: 12345 })
      const data: Record<string, unknown> = {}

      await getHandleUpload(
        buildContext({ streamOptions: { ...streamOptions, status: false } } as unknown as Partial<CollectionContext>),
      )({
        collection: { slug: 'media' },
        data,
        file: createFile({ filename: 'clip.mp4', mimeType: 'video/mp4' }),
        req: createReq(),
      } as never)

      expect(getStreamVideoMock).not.toHaveBeenCalled()
      expect((data.bunnyData as { stream: unknown }).stream).toEqual({ videoId: 'video-guid' })
    })

    it('replaces the old resolutions with null when the status is turned off and mp4Fallback is on', async () => {
      createStreamVideoMock.mockResolvedValue({ guid: 'video-guid', videoLibraryId: 12345 })
      const data: Record<string, unknown> = {
        bunnyData: { stream: { resolutions: { available: ['720p'], highest: '720p' }, videoId: 'old-guid' } },
      }

      await getHandleUpload(
        buildContext({
          streamOptions: { ...streamOptions, mp4Fallback: true, status: false },
        } as unknown as Partial<CollectionContext>),
      )({
        collection: { slug: 'media' },
        data,
        file: createFile({ filename: 'clip.mp4', mimeType: 'video/mp4' }),
        req: createReq(),
      } as never)

      expect((data.bunnyData as { stream: unknown }).stream).toEqual({ resolutions: null, videoId: 'video-guid' })
    })

    it('creates a tracking session when cleanup is enabled', async () => {
      createStreamVideoMock.mockResolvedValue({ guid: 'video-guid', videoLibraryId: 999 })
      uploadStreamVideoMock.mockResolvedValue(undefined)
      createStreamVideoSessionMock.mockResolvedValue({ id: 'session-1' })

      const req = createReq()
      const handler = getHandleUpload(
        buildContext({ streamOptions: { ...streamOptions, cleanup: true } } as unknown as Partial<CollectionContext>),
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
    it('uploads via the HTTP backend when no S3 options are present', async () => {
      uploadStorageFileMock.mockResolvedValue(undefined)

      const handler = getHandleUpload(buildContext({ storageOptions } as unknown as Partial<CollectionContext>))
      const data: Record<string, unknown> = {}
      const file = createFile()

      await handler({
        collection: { slug: 'media' },
        data,
        file,
        req: createReq(),
        storageFilePath: 'photo.jpg',
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
      expect(data).toEqual({})
      expect(purgeCacheMock).not.toHaveBeenCalled()
    })

    it('leaves the Bunny data alone, because the document write already forgot the old video', async () => {
      uploadStorageFileMock.mockResolvedValue(undefined)
      const data: Record<string, unknown> = { mimeType: 'image/jpeg' }

      await getHandleUpload(buildContext({ storageOptions, streamOptions } as unknown as Partial<CollectionContext>))({
        collection: { slug: 'media' },
        data,
        file: createFile(),
        req: createReq(),
      } as never)

      expect(uploadStorageFileMock).toHaveBeenCalled()
      expect(createStreamVideoMock).not.toHaveBeenCalled()
      expect(data).toEqual({ mimeType: 'image/jpeg' })
    })

    it('uploads via the S3 backend when S3 options are present', async () => {
      uploadStorageFileS3Mock.mockResolvedValue(undefined)

      const handler = getHandleUpload(
        buildContext({ storageOptions: { ...storageOptions, s3: true } } as unknown as Partial<CollectionContext>),
      )
      const file = createFile({ filename: 'doc.pdf', mimeType: 'application/pdf' })

      await handler({
        collection: { slug: 'media' },
        data: {},
        file,
        req: createReq(),
        storageFilePath: 'doc.pdf',
      } as never)

      expect(uploadStorageFileS3Mock).toHaveBeenCalledWith({
        apiKey: 'storage-key',
        buffer: file.buffer,
        mimeType: 'application/pdf',
        path: 'doc.pdf',
        region: 'de',
        timeout: 60000,
        zoneName: 'my-zone',
      })
      expect(uploadStorageFileMock).not.toHaveBeenCalled()
    })

    it('keeps an empty document prefix under the collection prefix', async () => {
      uploadStorageFileMock.mockResolvedValue(undefined)

      const handler = getHandleUpload(
        buildContext({ prefix: 'media', storageOptions } as unknown as Partial<CollectionContext>),
      )
      const data = { prefix: '' }

      await handler({
        collection: { slug: 'media' },
        data,
        file: createFile(),
        req: createReq(),
        storageFilePath: buildUploadStoragePathData({ collectionPrefix: 'media', docPrefix: '', filename: 'photo.jpg' })
          .storageFilePath,
      } as never)

      expect(uploadStorageFileMock.mock.calls[0][0].path).toBe('media/photo.jpg')
    })
  })

  describe('purge after upload', () => {
    it('does not purge the cache, because every upload writes a new key', async () => {
      uploadStorageFileMock.mockResolvedValue(undefined)

      const handler = getHandleUpload(
        buildContext({ purgeOptions: { async: false }, storageOptions } as unknown as Partial<CollectionContext>),
      )

      await handler({
        collection: { slug: 'media' },
        data: {},
        file: createFile(),
        req: createReq(),
        storageFilePath: 'photo.jpg',
      } as never)

      expect(uploadStorageFileMock).toHaveBeenCalled()
      expect(purgeCacheMock).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('throws the upload-failed APIError and logs the cause when neither storage nor stream is configured', async () => {
      const req = createReq()
      const handler = getHandleUpload(buildContext())

      await expect(
        handler({
          collection: { slug: 'media' },
          data: {},
          file: createFile(),
          req,
          storageFilePath: 'photo.jpg',
        } as never),
      ).rejects.toThrow('@seshuk/payload-storage-bunny:errorUploadFileFailed')

      const loggedErr = (req.payload.logger.error.mock.calls[0][0] as { err: Error }).err
      expect(loggedErr.message).toBe('@seshuk/payload-storage-bunny:errorNoServiceConfigured')
    })

    it('wraps a failed upload in the upload-failed APIError and logs it', async () => {
      uploadStorageFileMock.mockRejectedValue(new Error('network down'))

      const req = createReq()
      const handler = getHandleUpload(buildContext({ storageOptions } as unknown as Partial<CollectionContext>))

      await expect(
        handler({
          collection: { slug: 'media' },
          data: {},
          file: createFile(),
          req,
          storageFilePath: 'photo.jpg',
        } as never),
      ).rejects.toThrow('@seshuk/payload-storage-bunny:errorUploadFileFailed')

      expect(req.payload.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ msg: '[bunny:storage] upload: failed', storage: 'my-zone' }),
      )
    })
  })
})

describe('getForgetStreamVideoHook', () => {
  const oldVideo = () => ({
    bunnyData: { stream: { resolutions: { available: ['720p'] }, status: 'ready', videoId: 'old-guid' } },
  })

  const runHook = (
    data: Record<string, unknown>,
    file: Record<string, unknown> | undefined,
    options: Record<string, unknown> = streamOptions,
  ) =>
    getForgetStreamVideoHook(
      buildContext({ storageOptions, streamOptions: options } as unknown as Partial<CollectionContext>),
    )({ data, req: { file } } as never)

  it.each([
    [true, true, { resolutions: null, status: null, videoId: null }],
    [true, false, { resolutions: { available: ['720p'] }, status: null, videoId: null }],
    [false, true, { resolutions: { available: ['720p'] }, status: 'ready', videoId: null }],
  ])(
    'forgets the old video when a server upload stores the file in Storage (status %s, mp4Fallback %s)',
    (status, mp4Fallback, expected) => {
      const data = { ...oldVideo(), mimeType: 'image/jpeg' }

      runHook(data, { name: 'photo.jpg' }, { ...streamOptions, mp4Fallback, status })

      expect(data.bunnyData.stream).toEqual(expected)
    },
  )

  it('forgets the old video when a client upload stores the file in Storage', () => {
    const data = { ...oldVideo(), mimeType: 'image/jpeg' }

    runHook(data, { name: 'photo.jpg', uploadReference: {} })

    expect(data.bunnyData.stream.videoId).toBeNull()
  })

  it('forgets the old video when Stream has no API key, because the file goes to Storage', () => {
    const data = { ...oldVideo(), mimeType: 'video/mp4' }

    runHook(data, { name: 'clip.mp4' }, { ...streamOptions, apiKey: '' })

    expect(data.bunnyData.stream.videoId).toBeNull()
  })

  it.each([
    ['a file that goes to Stream', { ...oldVideo(), mimeType: 'video/mp4' }, { name: 'clip.mp4' }],
    ['a save without a file', { ...oldVideo(), mimeType: 'image/jpeg' }, undefined],
  ])('keeps the stored video for %s', (_label, data, file) => {
    runHook(data, file)

    expect(data.bunnyData).toEqual(oldVideo().bunnyData)
  })
})
