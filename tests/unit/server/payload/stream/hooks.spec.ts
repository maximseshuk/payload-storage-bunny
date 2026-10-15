import { MissingFile } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteSessionMock, getOffsetMock, getVideoMock, originalSizeMock, saveStateMock } = vi.hoisted(() => ({
  deleteSessionMock: vi.fn(),
  getOffsetMock: vi.fn(),
  getVideoMock: vi.fn(),
  originalSizeMock: vi.fn(async () => 0),
  saveStateMock: vi.fn(),
}))

vi.mock('@/server/bunny/stream.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/bunny/stream.js')>()
  saveStateMock.mockImplementation(actual.getStreamSaveState)
  return {
    getStreamSaveState: saveStateMock,
    getStreamTusUpload: actual.getStreamTusUpload,
    getStreamTusUploadOffset: getOffsetMock,
    getStreamVideo: getVideoMock,
    getStreamVideoOriginalSize: originalSizeMock,
    getStreamVideoState: actual.getStreamVideoState,
    isVideoInErrorState: actual.isVideoInErrorState,
    isVideoProcessed: actual.isVideoProcessed,
  }
})

vi.mock('@/server/payload/stream/sessionsCollection.js', () => ({
  deleteStreamVideoSession: deleteSessionMock,
}))

const {
  getAfterChangeHook,
  getBeforeValidateHook,
  getStreamBeforeChangeHook,
  getStreamFileChangeBeforeOperationHook,
  getStreamKeysBeforeChangeHook,
  getStreamKeysBeforeDeleteHook,
} = await import('@/server/payload/stream/hooks.js')

import type { CollectionContext } from '@/shared/types/index.js'

import { httpError } from '../../../../helpers/unit/httpError.js'
import { createBaseStream } from '../../../../helpers/unit/optionsBuilders.js'
import { buildStreamReq } from '../../../../helpers/unit/stream.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const buildContext = (overrides: Partial<CollectionContext> = {}): CollectionContext =>
  ({
    collection: { slug: 'media' },
    isTusUploadSupported: false,
    streamOptions: { ...createBaseStream(), status: true },
    usePayloadAccessControl: true,
    ...overrides,
  }) as unknown as CollectionContext

const emptyOptions = { collections: new Map() } as never

const buildReq = (overrides: Record<string, unknown> = {}) =>
  buildStreamReq({ collections: { media: {} }, payload: { db: { findOne: async () => null } }, ...overrides })

describe('stream hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getBeforeValidateHook', () => {
    it('throws MissingFile when a create requires a file and none is present', async () => {
      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: true,
      })
      await expect(hook({ data: {}, operation: 'create', req: buildReq() } as never)).rejects.toBeInstanceOf(
        MissingFile,
      )
    })

    it('throws MissingFile when validating a new document without a file, but not an existing one', async () => {
      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: true,
      })
      await expect(hook({ data: {}, operation: 'validate', req: buildReq() } as never)).rejects.toBeInstanceOf(
        MissingFile,
      )
      await expect(
        hook({ data: {}, operation: 'validate', originalDoc: { id: 1 }, req: buildReq() } as never),
      ).resolves.toBeDefined()
      expect(getVideoMock).not.toHaveBeenCalled()
    })

    it('clears the videoId on a normal create with a file', async () => {
      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: true,
      })
      const data: Record<string, unknown> = {}

      const result = (await hook({
        data,
        operation: 'create',
        req: buildReq({ file: { name: 'a.jpg' } }),
      } as never)) as Record<string, any>

      expect(result.bunnyData.stream.videoId).toBeNull()
      expect(getVideoMock).not.toHaveBeenCalled()
    })

    it('skips the file check for a draft create', async () => {
      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: true,
      })

      await expect(
        hook({ data: { _status: 'draft' }, operation: 'create', req: buildReq() } as never),
      ).resolves.toBeDefined()
    })

    it('fills the managed file fields of a TUS video saved by videoId without a file', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-123', status: 4, storageSize: 4096, title: 'great-video.mp4' })

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: true,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-123' } } }

      const result = (await hook({ data, operation: 'create', req: buildReq() } as never)) as Record<string, any>

      expect(result).toMatchObject({
        filename: 'great-video-original.mp4',
        filesize: 4096,
        focalX: null,
        focalY: null,
        height: null,
        mimeType: 'video/mp4',
        prefix: '',
        width: null,
      })
      expect(result._objectKey).toMatch(UUID)
      expect(result.original).toEqual({
        _objectKey: result._objectKey,
        filename: 'great-video-original.mp4',
        filesize: 4096,
        mimeType: 'video/mp4',
        prefix: '',
      })
      expect(result.bunnyData.stream).toEqual({ status: 'ready', videoId: 'v-123' })
    })

    it('stores the verified client upload video and keeps the file fields from Payload', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-123', status: 2, storageSize: 0, title: 'clip.mp4' })
      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({ streamOptions: { ...buildContext().streamOptions!, mimeTypes: ['video/*'] } }),
        filesRequiredOnCreate: true,
      })
      const fileFields = { _objectKey: 'v-123', filename: 'clip-original.mp4', filesize: 10, prefix: 'media' }
      const file = { mimetype: 'video/mp4', uploadReference: { _objectKey: 'v-123', signedReceipt: 'receipt' } }
      const verified = { _objectKey: 'v-123', key: 'media/staged/clip-original.mp4', signedReceipt: 'receipt' }
      const req = buildReq({
        context: { _payloadVerifiedProviderOriginal: verified, bunnyVerifiedStreamUpload: 'v-123' },
        file,
      }) as { context: Record<string, unknown> }

      const result = (await hook({ data: { ...fileFields }, operation: 'create', req } as never)) as Record<string, any>

      expect(result).toMatchObject(fileFields)
      expect(result.bunnyData.stream).toEqual({ status: 'processing', videoId: 'v-123' })
      expect((req.context.bunnyStreamKeys as Map<string, Map<string, string>>).get('media')).toEqual(
        new Map([['media/staged/clip-original.mp4', 'v-123']]),
      )

      const fromStorage = (await hook({
        data: {},
        operation: 'create',
        req: buildReq({ context: { _payloadVerifiedProviderOriginal: verified }, file }),
      } as never)) as Record<string, any>
      expect(fromStorage.bunnyData.stream.videoId).toBeNull()

      const forged = (await hook({
        data: {},
        operation: 'create',
        req: buildReq({
          context: {
            _payloadVerifiedProviderOriginal: { ...verified, signedReceipt: 'other' },
            bunnyVerifiedStreamUpload: 'v-123',
          },
          file,
        }),
      } as never)) as Record<string, any>
      expect(forged.bunnyData.stream.videoId).toBeNull()
    })

    it('names the file after the video ID when the video has no title and keeps the collection prefix', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-123', status: 1, storageSize: 1, title: '' })

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({ prefix: 'media' }),
        filesRequiredOnCreate: true,
      })
      const data = { bunnyData: { stream: { videoId: 'v-123' } } }

      const result = (await hook({ data, operation: 'create', req: buildReq() } as never)) as Record<string, any>

      expect(result).toMatchObject({ filename: 'video-v-123-original', prefix: 'media' })
      expect(result.original).toMatchObject({ filename: 'video-v-123-original', prefix: 'media' })
    })

    it('gives the file a unique name within its prefix', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-123', status: 4, storageSize: 1, title: 'clip.mp4' })
      const findOne = vi.fn(async ({ where }: any) =>
        where.and?.[0].or.some((clause: any) => clause.filename?.equals === 'clip-original.mp4')
          ? { id: 'taken' }
          : null,
      )
      const req = buildReq({
        payload: {
          collections: { media: { config: { slug: 'media', fields: [{ name: 'prefix', type: 'text' }] } } },
          db: { findOne },
          logger: { debug: vi.fn(), error: vi.fn() },
        },
      })

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({ prefix: 'media' }),
        filesRequiredOnCreate: true,
      })
      const data = { bunnyData: { stream: { videoId: 'v-123' } } }

      const result = (await hook({ data, operation: 'create', req } as never)) as Record<string, any>

      expect(result.filename).toBe('clip-original-1.mp4')
      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ and: expect.arrayContaining([{ prefix: { equals: 'media' } }]) }),
        }),
      )
    })

    it('stores the resolutions of a ready video set by videoId when mp4Fallback is on', async () => {
      const resolutions = { available: ['1080p'], highest: '1080p' }
      getVideoMock.mockResolvedValue({ guid: 'v-123', status: 4, storageSize: 1, title: 'Ready' })
      saveStateMock.mockResolvedValueOnce({ resolutions, status: 'ready' })

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({
          streamOptions: { ...createBaseStream(), mp4Fallback: true, status: true },
        } as never),
        filesRequiredOnCreate: true,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-123' } } }

      const result = (await hook({ data, operation: 'create', req: buildReq() } as never)) as Record<string, any>

      expect(saveStateMock).toHaveBeenCalledWith(expect.objectContaining({ mp4Fallback: true }))
      expect(result.bunnyData.stream).toEqual({ resolutions, status: 'ready', videoId: 'v-123' })
    })

    it('fills the file fields again when an update changes the videoId', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-new', status: 4, storageSize: 100, title: 'New' })

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-new' } } }
      const originalDoc = { bunnyData: { stream: { videoId: 'v-old' } }, filename: 'old.mp4' }
      const req = buildReq()

      const result = (await hook({ data, operation: 'update', originalDoc, req } as never)) as Record<string, any>

      expect(getVideoMock).toHaveBeenCalled()
      expect(result.filename).toBe('New-original')
      expect(result.original.filename).toBe('New-original')
    })

    it('does not treat the cloud-storage metadata update after a server upload as a replacement', async () => {
      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-new' } } }
      const originalDoc = { bunnyData: { stream: { videoId: null } }, filename: 'clip.mp4' }
      const req = buildReq({ context: { skipCloudStorage: true } })

      const result = (await hook({ data, operation: 'update', originalDoc, req } as never)) as Record<string, any>

      expect(getVideoMock).not.toHaveBeenCalled()
      expect(result.filename).toBeUndefined()
    })

    it('skips processing when the context has no stream options', async () => {
      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({ streamOptions: undefined }),
        filesRequiredOnCreate: false,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-123' } } }

      const result = (await hook({ data, operation: 'create', req: buildReq() } as never)) as Record<string, any>

      expect(getVideoMock).not.toHaveBeenCalled()
      expect(result.filename).toBeUndefined()
    })

    it('names the file while the video is still encoding', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-123', status: 0, title: 'Pending' })

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-123' } } }

      const result = (await hook({ data, operation: 'create', req: buildReq() } as never)) as Record<string, any>

      expect(getVideoMock).toHaveBeenCalled()
      expect(result.filename).toBe('Pending-original')
    })

    it('gives a document with a non-Stream file the video type and size when a new video is set without a file', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-new', status: 1, storageSize: 0, title: 'Pending' })

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const originalDoc = {
        bunnyData: { stream: { videoId: null } },
        filename: 'photo.png',
        filesize: 1234,
        mimeType: 'image/png',
      }

      const image = (await hook({
        data: { bunnyData: { stream: { videoId: 'v-new' } } },
        operation: 'update',
        originalDoc,
        req: buildReq(),
      } as never)) as Record<string, any>
      const video = (await hook({
        data: { bunnyData: { stream: { videoId: 'v-new' } }, filesize: 99, mimeType: 'video/quicktime' },
        operation: 'update',
        originalDoc,
        req: buildReq(),
      } as never)) as Record<string, any>

      expect(image).toMatchObject({ filesize: 0, mimeType: 'video/mp4' })
      expect(video).toMatchObject({ filesize: 99, mimeType: 'video/quicktime' })
    })

    it('stores the state of a replacement video that is still encoding', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-new', status: 0, title: 'Pending' })

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-new' } } }
      const originalDoc = { bunnyData: { stream: { status: 'ready', videoId: 'v-old' } }, filename: 'old.mp4' }

      const result = (await hook({ data, operation: 'update', originalDoc, req: buildReq() } as never)) as Record<
        string,
        any
      >

      expect(result.bunnyData.stream).toEqual({ status: 'processing', videoId: 'v-new' })
    })

    it('clears the old resolutions when a replacement video is still encoding and mp4Fallback is on', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-new', status: 2, title: 'Pending' })
      const oldResolutions = { available: ['720p'], highest: '720p' }

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({
          streamOptions: { ...createBaseStream(), mp4Fallback: true, status: true },
        } as never),
        filesRequiredOnCreate: false,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { resolutions: oldResolutions, videoId: 'v-new' } } }
      const originalDoc = {
        bunnyData: { stream: { resolutions: oldResolutions, status: 'ready', videoId: 'v-old' } },
        filename: 'old.mp4',
      }

      const result = (await hook({ data, operation: 'update', originalDoc, req: buildReq() } as never)) as Record<
        string,
        any
      >

      expect(result.bunnyData.stream).toEqual({ resolutions: null, status: 'processing', videoId: 'v-new' })
    })

    it('clears the old resolutions when a save removes the video and mp4Fallback is on', async () => {
      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({
          streamOptions: { ...createBaseStream(), mp4Fallback: true, status: true },
        } as never),
        filesRequiredOnCreate: false,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { resolutions: { available: ['720p'] } } } }

      const result = (await hook({
        data,
        operation: 'update',
        originalDoc: { bunnyData: { stream: { videoId: 'v-old' } } },
        req: buildReq({ file: { name: 'a.jpg' } }),
      } as never)) as Record<string, any>

      expect(result.bunnyData.stream).toEqual({ resolutions: null, status: null, videoId: null })
    })

    it('stores no state when the collection has the status turned off', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-123', status: 4, storageSize: 4096, title: 'Great Video' })

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({ streamOptions: { ...createBaseStream(), status: false } as never }),
        filesRequiredOnCreate: true,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-123' } } }

      const result = (await hook({ data, operation: 'create', req: buildReq() } as never)) as Record<string, any>

      expect(result.bunnyData.stream).toEqual({ videoId: 'v-123' })
      expect(saveStateMock).not.toHaveBeenCalled()
    })

    it('clears the old resolutions of a replaced video when the status is turned off and mp4Fallback is on', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-new', status: 2, title: 'Pending' })
      const oldResolutions = { available: ['720p'], highest: '720p' }

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({
          streamOptions: { ...createBaseStream(), mp4Fallback: true, status: false },
        } as never),
        filesRequiredOnCreate: false,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { resolutions: oldResolutions, videoId: 'v-new' } } }
      const originalDoc = {
        bunnyData: { stream: { resolutions: oldResolutions, videoId: 'v-old' } },
        filename: 'old.mp4',
      }

      const result = (await hook({ data, operation: 'update', originalDoc, req: buildReq() } as never)) as Record<
        string,
        any
      >

      expect(result.bunnyData.stream).toEqual({ resolutions: null, videoId: 'v-new' })
    })

    it('does not reprocess when the update videoId is unchanged', async () => {
      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-same' } } }
      const originalDoc = {
        bunnyData: { stream: { videoId: 'v-same' } },
        filename: 'same.mp4',
        filesize: 10,
        mimeType: 'video/mp4',
      }

      await hook({ data, operation: 'update', originalDoc, req: buildReq() } as never)

      expect(getVideoMock).not.toHaveBeenCalled()
    })

    it('puts back the stored file fields when an update of the same video clears them', async () => {
      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const data: Record<string, unknown> = {
        bunnyData: { stream: { videoId: 'v-same' } },
        filename: null,
        filesize: null,
        mimeType: null,
      }
      const originalDoc = {
        bunnyData: { stream: { videoId: 'v-same' } },
        filename: 'same.mp4',
        filesize: 10,
        mimeType: 'video/webm',
      }

      const result = (await hook({ data, operation: 'update', originalDoc, req: buildReq() } as never)) as Record<
        string,
        any
      >

      expect(result).toMatchObject({ filename: 'same.mp4', filesize: 10, mimeType: 'video/webm' })
      expect(getVideoMock).not.toHaveBeenCalled()
    })

    it('fills missing file fields of the same video from Bunny and keeps its storage key', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-same', status: 1, storageSize: 0, title: 'clip.mp4' })
      originalSizeMock.mockResolvedValueOnce(2048)
      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const original = { _objectKey: 'key-1', filename: null, filesize: null, mimeType: null, prefix: 'videos' }
      const data: Record<string, unknown> = {
        bunnyData: { stream: { status: 'processing', videoId: 'v-same' } },
        filename: null,
        filesize: 0,
        mimeType: null,
      }
      const originalDoc = {
        _objectKey: 'key-1',
        bunnyData: { stream: { status: 'processing', videoId: 'v-same' } },
        original,
        prefix: 'videos',
      }

      const result = (await hook({ data, operation: 'update', originalDoc, req: buildReq() } as never)) as Record<
        string,
        any
      >

      expect(result).toMatchObject({ filename: 'clip-original.mp4', filesize: 2048, mimeType: 'video/mp4' })
      expect(result._objectKey).toBeUndefined()
      expect(result.original).toEqual({
        _objectKey: 'key-1',
        filename: 'clip-original.mp4',
        filesize: 2048,
        mimeType: 'video/mp4',
        prefix: 'videos',
      })
      expect(result.bunnyData.stream).toEqual({ status: 'processing', videoId: 'v-same' })
      expect(originalSizeMock).toHaveBeenCalledWith({ apiKey: 'stream-key', libraryId: 12345, videoId: 'v-same' })
      expect(saveStateMock).not.toHaveBeenCalled()
    })

    it('falls back to the storage size when Bunny cannot report the original file size', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-123', status: 4, storageSize: 4096, title: 'clip.mp4' })
      originalSizeMock.mockRejectedValueOnce(new Error('rate limited'))
      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({ streamOptions: createBaseStream() } as never),
        filesRequiredOnCreate: true,
      })

      const result = (await hook({
        data: { bunnyData: { stream: { videoId: 'v-123' } } },
        operation: 'create',
        req: buildReq(),
      } as never)) as Record<string, any>

      expect(result.filesize).toBe(4096)
    })

    it('saves an update of the same video without the missing file fields when Bunny cannot read the video', async () => {
      const warn = vi.fn()
      getVideoMock.mockRejectedValue(new Error('not found'))
      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const originalDoc = { bunnyData: { stream: { videoId: 'v-gone' } }, filename: 'gone.mp4', mimeType: 'video/mp4' }
      const req = buildReq({ payload: { logger: { debug: vi.fn(), error: vi.fn(), warn } } })

      const result = (await hook({
        data: { alt: 'x', bunnyData: { stream: { videoId: 'v-gone' } } },
        operation: 'update',
        originalDoc,
        req,
      } as never)) as Record<string, any>

      expect(result).toMatchObject({ alt: 'x', filename: 'gone.mp4', mimeType: 'video/mp4' })
      expect(result.filesize).toBeUndefined()
      expect(warn).toHaveBeenCalledOnce()
    })

    it('takes the file size of a new video from its original file', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-123', status: 1, storageSize: 0, title: 'clip.mp4' })
      originalSizeMock.mockResolvedValueOnce(2048)
      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({ streamOptions: createBaseStream() } as never),
        filesRequiredOnCreate: true,
      })

      const result = (await hook({
        data: { bunnyData: { stream: { videoId: 'v-123' } } },
        operation: 'create',
        req: buildReq(),
      } as never)) as Record<string, any>

      expect(result.filesize).toBe(2048)
      expect(result.original.filesize).toBe(2048)
    })

    describe('a video uploaded over TUS', () => {
      const tusVideo = (status: number) => ({
        guid: 'v-tus',
        metaTags: [
          { property: 'payload-storage-bunny:upload-url', value: 'https://video.bunnycdn.com/tusupload/u-1' },
          { property: 'payload-storage-bunny:upload-length', value: '4096' },
        ],
        status,
        storageSize: 0,
        title: 'clip.mp4',
      })
      const save = (filesize?: number) => {
        const warn = vi.fn()
        const hook = getBeforeValidateHook({
          options: emptyOptions,
          context: buildContext({ streamOptions: createBaseStream() } as never),
          filesRequiredOnCreate: true,
        })
        const result = hook({
          data: { bunnyData: { stream: { videoId: 'v-tus' } }, filesize, mimeType: 'video/mp4' },
          operation: 'create',
          req: buildReq({
            payload: {
              collections: { media: { config: { slug: 'media' } } },
              db: { findOne: async () => null },
              logger: { debug: vi.fn(), error: vi.fn(), warn },
              secret: 'payload-secret',
            },
          }),
        } as never) as Promise<Record<string, any>>
        return { result, warn }
      }

      it('takes the file size from the finished upload, not from the request', async () => {
        getVideoMock.mockResolvedValue(tusVideo(0))
        getOffsetMock.mockResolvedValue({ length: 4096, offset: 4096 })

        const doc = await save(1).result

        expect(doc.filesize).toBe(4096)
        expect(doc.original.filesize).toBe(4096)
        expect(getOffsetMock).toHaveBeenCalledWith(
          expect.objectContaining({ uploadUrl: 'https://video.bunnycdn.com/tusupload/u-1' }),
        )
        expect(originalSizeMock).not.toHaveBeenCalled()
      })

      it.each([
        ['matches it', () => originalSizeMock.mockResolvedValueOnce(4096)],
        ['is unknown', () => originalSizeMock.mockResolvedValueOnce(0)],
        ['cannot be read', () => originalSizeMock.mockRejectedValueOnce(new Error('HTTP 500'))],
      ])(
        'takes the stored upload length when Bunny has forgotten the upload of a processed video and its original %s',
        async (_label, arrange) => {
          getVideoMock.mockResolvedValue(tusVideo(3))
          getOffsetMock.mockRejectedValue(new Error('HTTP 404', { cause: httpError(404) }))
          arrange()

          expect((await save().result).filesize).toBe(4096)
          expect(originalSizeMock).toHaveBeenCalledWith({ apiKey: 'stream-key', libraryId: 12345, videoId: 'v-tus' })
        },
      )

      it.each([
        ['the upload has not finished yet', 0, async () => ({ length: 4096, offset: 1024 }), undefined],
        ['Bunny Stream marked the upload as failed', 6, async () => undefined, undefined],
        [
          'the original file in Bunny Stream does not match the upload size',
          3,
          async () => {
            throw new Error('HTTP 404', { cause: httpError(404) })
          },
          5000,
        ],
      ])('rejects the save with 400 when %s', async (reason, status, offset, original) => {
        getVideoMock.mockResolvedValue(tusVideo(status))
        getOffsetMock.mockImplementation(offset)
        if (original) {
          originalSizeMock.mockResolvedValueOnce(original)
        }

        const { result, warn } = save(4096)

        await expect(result).rejects.toMatchObject({
          data: {
            errors: [{ message: `The video upload is not usable: ${reason}.`, path: 'bunnyData.stream.videoId' }],
          },
          status: 400,
        })
        expect(warn).toHaveBeenCalledWith(expect.objectContaining({ msg: `[bunny:stream] save: ${reason}` }))
      })
    })
  })

  describe('video ownership', () => {
    const libraryOptions = {
      collections: new Map([
        ['media', { stream: { libraryId: 12345 } }],
        ['clips', { stream: { libraryId: 12345 } }],
        ['other', { stream: { libraryId: 999 } }],
        ['files', {}],
        ['ghost', { stream: { libraryId: 12345 } }],
      ]),
    } as never

    const buildOwnershipReq = () => {
      const findOne = vi.fn(async () => null)
      const req = buildReq({
        collections: { clips: {}, files: {}, media: {}, other: {} },
        payload: { db: { findOne } },
      })
      return { findOne, req }
    }

    const sharedData = () => ({ bunnyData: { stream: { videoId: 'v-shared' } } })

    it('searches only stream collections of the same library', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-shared', status: 0 })
      const hook = getBeforeValidateHook({
        options: libraryOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const { findOne, req } = buildOwnershipReq()

      await hook({ data: sharedData(), operation: 'create', req } as never)

      const videoLookups = findOne.mock.calls.filter(([args]: any) => !args.where.or && !args.where.and?.[0]?.or)
      expect(videoLookups.map(([args]: any) => args.collection).toSorted()).toEqual(['clips', 'media'])
    })

    it('ignores the document being updated', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-shared', status: 0 })
      const hook = getBeforeValidateHook({
        options: libraryOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const { findOne, req } = buildOwnershipReq()
      const originalDoc = { bunnyData: { stream: { videoId: 'v-draft' } }, id: 'doc-1' }

      await expect(hook({ data: sharedData(), operation: 'update', originalDoc, req } as never)).resolves.toBeDefined()
      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'media',
          where: { and: [{ 'bunnyData.stream.videoId': { equals: 'v-shared' } }, { id: { not_equals: 'doc-1' } }] },
        }),
      )
    })

    it('does not look up an unchanged videoId', async () => {
      const hook = getBeforeValidateHook({
        options: libraryOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const { findOne, req } = buildOwnershipReq()
      const originalDoc = {
        bunnyData: { stream: { videoId: 'v-shared' } },
        filename: 'shared.mp4',
        filesize: 10,
        id: 'doc-2',
        mimeType: 'video/mp4',
      }

      await hook({ data: sharedData(), operation: 'update', originalDoc, req } as never)

      expect(findOne).not.toHaveBeenCalled()
    })
  })

  describe('getStreamBeforeChangeHook', () => {
    const resolutions = { available: ['720p'], highest: '720p' }
    const storedMain = { id: 1, bunnyData: { stream: { resolutions, status: 'ready', videoId: 'v1' } } }
    const mp4Context = () =>
      buildContext({ streamOptions: { apiKey: 'k', libraryId: 12345, mp4Fallback: true, status: true } as never })
    const reqWith = (findOne: unknown) =>
      buildReq({ payload: { db: { findOne }, logger: { debug: vi.fn(), error: vi.fn() } } })

    it('copies the stored status and resolutions of the main document over a stale draft value', async () => {
      const findOne = vi.fn().mockResolvedValue(storedMain)
      const data = { alt: 'new', bunnyData: { stream: { status: 'processing', videoId: 'v1' } } }

      const result = await getStreamBeforeChangeHook(mp4Context())({
        data,
        operation: 'update',
        originalDoc: { id: 1 },
        req: reqWith(findOne),
      } as never)

      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({ collection: 'media', where: { id: { equals: 1 } } }),
      )
      expect(result).toEqual({ alt: 'new', bunnyData: { stream: { resolutions, status: 'ready', videoId: 'v1' } } })
    })

    it('keeps fresh incoming resolutions when the main document has none stored', async () => {
      const findOne = vi.fn().mockResolvedValue({
        id: 1,
        bunnyData: { stream: { resolutions: null, status: 'ready', videoId: 'v1' } },
      })
      const data = { bunnyData: { stream: { resolutions, videoId: 'v1' } } }

      const result = await getStreamBeforeChangeHook(mp4Context())({
        data,
        operation: 'update',
        originalDoc: { id: 1 },
        req: reqWith(findOne),
      } as never)

      expect(result).toEqual({ bunnyData: { stream: { resolutions, status: 'ready', videoId: 'v1' } } })
    })

    it('keeps incoming resolutions that a server update changed', async () => {
      const stored = { available: ['720p', '1080p'], highest: '1080p' }
      const corrected = { available: ['720p', '1080p'], highest: '720p' }
      const findOne = vi
        .fn()
        .mockResolvedValue({ id: 1, bunnyData: { stream: { resolutions: stored, videoId: 'v1' } } })
      const data = { bunnyData: { stream: { resolutions: corrected, videoId: 'v1' } } }

      const result = await getStreamBeforeChangeHook(mp4Context())({
        data,
        operation: 'update',
        originalDoc: { id: 1, bunnyData: { stream: { resolutions: stored, videoId: 'v1' } } },
        req: reqWith(findOne),
      } as never)

      expect((result as any).bunnyData.stream.resolutions).toEqual(corrected)
    })

    it('copies the stored resolutions over an unchanged copy of the original document', async () => {
      const stale = { available: ['360p'], highest: '360p' }
      const findOne = vi.fn().mockResolvedValue(storedMain)
      const data = { bunnyData: { stream: { resolutions: stale, videoId: 'v1' } } }

      const result = await getStreamBeforeChangeHook(mp4Context())({
        data,
        operation: 'update',
        originalDoc: { id: 1, bunnyData: { stream: { resolutions: stale, videoId: 'v1' } } },
        req: reqWith(findOne),
      } as never)

      expect((result as any).bunnyData.stream.resolutions).toEqual(resolutions)
    })

    it('keeps the incoming values when the video changed', async () => {
      const findOne = vi.fn().mockResolvedValue(storedMain)
      const data = { bunnyData: { stream: { status: 'processing', videoId: 'v2' } } }

      const result = await getStreamBeforeChangeHook(mp4Context())({
        data,
        operation: 'update',
        originalDoc: { id: 1 },
        req: reqWith(findOne),
      } as never)

      expect(result).toEqual({ bunnyData: { stream: { status: 'processing', videoId: 'v2' } } })
    })

    describe('when the main document has another video', () => {
      const draftReq = (findVersions: unknown) =>
        buildReq({
          collections: { media: { versions: { drafts: true } } },
          payload: {
            db: { findOne: vi.fn().mockResolvedValue(storedMain), findVersions },
            logger: { debug: vi.fn(), error: vi.fn() },
          },
        })

      it('copies the stored status and resolutions of the draft version of this document with the video', async () => {
        const findVersions = vi.fn().mockResolvedValue({
          docs: [{ id: 'ver-1', version: { bunnyData: { stream: { resolutions, status: 'ready', videoId: 'v2' } } } }],
        })
        const data = { alt: 'autosave', bunnyData: { stream: { status: 'processing', videoId: 'v2' } } }

        const result = await getStreamBeforeChangeHook(mp4Context())({
          data,
          operation: 'update',
          originalDoc: { id: 1, bunnyData: { stream: { status: 'processing', videoId: 'v2' } } },
          req: draftReq(findVersions),
        } as never)

        expect(findVersions).toHaveBeenCalledWith(
          expect.objectContaining({
            collection: 'media',
            where: {
              and: [
                { and: [{ 'version.bunnyData.stream.videoId': { equals: 'v2' } }, { parent: { equals: 1 } }] },
                { latest: { equals: true } },
              ],
            },
          }),
        )
        expect(result).toEqual({
          alt: 'autosave',
          bunnyData: { stream: { resolutions, status: 'ready', videoId: 'v2' } },
        })
      })

      it('keeps the incoming values when no version has the video', async () => {
        const findVersions = vi.fn().mockResolvedValue({ docs: [] })
        const data = { bunnyData: { stream: { status: 'processing', videoId: 'v2' } } }

        const result = await getStreamBeforeChangeHook(mp4Context())({
          data,
          operation: 'update',
          originalDoc: { id: 1 },
          req: draftReq(findVersions),
        } as never)

        expect(findVersions).toHaveBeenCalled()
        expect(result).toEqual({ bunnyData: { stream: { status: 'processing', videoId: 'v2' } } })
      })
    })

    it('does not read the database on create or without a video', async () => {
      const findOne = vi.fn()
      const hook = getStreamBeforeChangeHook(mp4Context())

      await hook({
        data: { bunnyData: { stream: { videoId: 'v1' } } },
        operation: 'create',
        req: reqWith(findOne),
      } as never)
      await hook({ data: { alt: 'x' }, operation: 'update', originalDoc: { id: 1 }, req: reqWith(findOne) } as never)

      expect(findOne).not.toHaveBeenCalled()
    })

    it('refreshes the status and resolutions from Bunny when a version is restored', async () => {
      const findOne = vi.fn()
      getVideoMock.mockResolvedValue({ availableResolutions: '720p', guid: 'v1', status: 4 })
      saveStateMock.mockResolvedValueOnce({ resolutions, status: 'ready' })
      const data = { bunnyData: { stream: { resolutions: null, status: 'processing', videoId: 'v1' } } }

      const result = await getStreamBeforeChangeHook(mp4Context())({
        data,
        operation: 'update',
        originalDoc: { id: 1 },
        req: buildReq({
          context: { isRestoringVersion: true },
          payload: { db: { findOne }, logger: { debug: vi.fn(), error: vi.fn() } },
        }),
      } as never)

      expect(getVideoMock).toHaveBeenCalledWith({ apiKey: 'k', libraryId: 12345, videoId: 'v1' })
      expect(result).toEqual({ bunnyData: { stream: { resolutions, status: 'ready', videoId: 'v1' } } })
      expect(findOne).not.toHaveBeenCalled()
    })

    it('falls back to the stored status when Bunny cannot be read during a restore', async () => {
      const warn = vi.fn()
      const findOne = vi.fn().mockResolvedValue(storedMain)
      getVideoMock.mockRejectedValue(new Error('down'))
      const data = { bunnyData: { stream: { status: 'processing', videoId: 'v1' } } }

      const result = await getStreamBeforeChangeHook(mp4Context())({
        data,
        operation: 'update',
        originalDoc: { id: 1 },
        req: buildReq({
          context: { isRestoringVersion: true },
          payload: { db: { findOne }, logger: { debug: vi.fn(), error: vi.fn(), warn } },
        }),
      } as never)

      expect(warn).toHaveBeenCalledOnce()
      expect(result).toEqual({ bunnyData: { stream: { resolutions, status: 'ready', videoId: 'v1' } } })
    })

    it('copies only the resolutions when the status is turned off', async () => {
      const findOne = vi.fn().mockResolvedValue(storedMain)
      const data = { bunnyData: { stream: { videoId: 'v1' } } }

      const result = await getStreamBeforeChangeHook(
        buildContext({ streamOptions: { apiKey: 'k', libraryId: 12345, mp4Fallback: true, status: false } as never }),
      )({ data, operation: 'update', originalDoc: { id: 1 }, req: reqWith(findOne) } as never)

      expect(result).toEqual({ bunnyData: { stream: { resolutions, videoId: 'v1' } } })
    })
  })

  describe('getAfterChangeHook', () => {
    it('deletes the upload session when cleanup is enabled and a videoId exists', async () => {
      const hook = getAfterChangeHook(
        buildContext({ streamOptions: { apiKey: 'k', cleanup: true, libraryId: 12345 } as never }),
      )
      const req = buildReq()
      await hook({ data: { bunnyData: { stream: { videoId: 'v1' } } }, req } as never)

      expect(deleteSessionMock).toHaveBeenCalledWith({ libraryId: 12345, req, videoId: 'v1' })
    })

    describe('the upload metadata of a draft save', () => {
      const draftDoc = {
        _status: 'draft',
        bunnyData: { stream: { status: 'processing', videoId: 'vid-a' } },
        filename: 'a.mp4',
        id: 'doc-1',
      }
      const save = async (
        doc: Record<string, unknown>,
        context: Record<string, unknown> = { skipCloudStorage: true },
      ) => {
        const updateOne = vi.fn()
        const req = buildReq({ context, payload: { db: { updateOne }, logger: { debug: vi.fn(), error: vi.fn() } } })
        await getAfterChangeHook(buildContext())({ data: {}, doc, req } as never)
        return updateOne
      }

      it('copies the video to a main document that has the same file and no video yet', async () => {
        const updateOne = await save(draftDoc)

        expect(updateOne).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            collection: 'media',
            data: { bunnyData: { stream: { status: 'processing', videoId: 'vid-a' } }, updatedAt: null },
            where: {
              and: [
                { id: { equals: 'doc-1' } },
                { _status: { equals: 'draft' } },
                { filename: { equals: 'a.mp4' } },
                {
                  or: [
                    { 'bunnyData.stream.videoId': { exists: false } },
                    { 'bunnyData.stream.videoId': { equals: null } },
                  ],
                },
              ],
            },
          }),
        )
      })

      it.each([
        ['a published save', { ...draftDoc, _status: 'published' }, { skipCloudStorage: true }],
        ['a save that is not the upload metadata write', draftDoc, {}],
        [
          'a draft without a video',
          { ...draftDoc, bunnyData: { stream: { videoId: null } } },
          { skipCloudStorage: true },
        ],
      ])('writes nothing for %s', async (_, doc, context) => {
        expect(await save(doc, context)).not.toHaveBeenCalled()
      })
    })

    it('does nothing when cleanup is off', async () => {
      const hook = getAfterChangeHook(buildContext({ isTusUploadSupported: true }))
      await hook({ data: { bunnyData: { stream: { videoId: 'v1' } } }, doc: {}, req: buildReq() } as never)

      expect(deleteSessionMock).not.toHaveBeenCalled()
    })
  })
})

describe('getStreamFileChangeBeforeOperationHook', () => {
  const stored = (videoId: null | string) => ({ _objectKey: 'key-a', bunnyData: { stream: { videoId } } })
  const run = ({
    data,
    drafts = false,
    file,
    latest = stored('v-a'),
    operation = 'update',
  }: {
    data: Record<string, any>
    drafts?: boolean
    file?: unknown
    latest?: unknown
    operation?: string
  }) => {
    const findOne = vi.fn(async () => latest)
    const findVersions = vi.fn(async () => ({ docs: latest ? [{ version: latest }] : [] }))
    const req = {
      context: {},
      file,
      payload: {
        collections: { media: { config: { versions: drafts ? { drafts: { autosave: true } } : true } } },
        db: { findOne, findVersions },
      },
    }
    const hook = getStreamFileChangeBeforeOperationHook(buildContext())
    return {
      findOne,
      findVersions,
      result: hook({ args: { data, id: 1, req }, operation, req } as never) as Promise<{ data: Record<string, any> }>,
    }
  }

  it('gives the update a new file key when a TUS video replaces the stored video, so Payload cleans up the old file', async () => {
    const data = { bunnyData: { stream: { videoId: 'v-b' } } }
    const { findOne, result } = run({ data })
    await result

    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { equals: 1 } } }))
    expect((data as Record<string, unknown>)._objectKey).toMatch(/^[\da-f-]{36}$/)
  })

  it('compares with the latest version in a drafts collection', async () => {
    const data = { bunnyData: { stream: { videoId: 'v-b' } } }
    const { findOne, findVersions, result } = run({ data, drafts: true })
    await result

    expect(findOne).not.toHaveBeenCalled()
    expect(findVersions).toHaveBeenCalledWith(
      expect.objectContaining({ where: { and: [{ parent: { equals: 1 } }, { latest: { equals: true } }] } }),
    )
    expect((data as Record<string, unknown>)._objectKey).toBeDefined()
  })

  it.each([
    ['the same video', { data: { bunnyData: { stream: { videoId: 'v-a' } } } }],
    ['no video', { data: { alt: 'x' } }],
    ['a file upload', { data: { bunnyData: { stream: { videoId: 'v-b' } } }, file: { name: 'clip.mp4' } }],
    ['a create', { data: { bunnyData: { stream: { videoId: 'v-b' } } }, operation: 'create' }],
  ])('leaves the file key alone for %s', async (_label, args) => {
    const { result } = run(args)
    await result

    expect(args.data).not.toHaveProperty('_objectKey')
  })
})

const resolveStorageKey = ({ _objectKey, filename, prefix }: Record<string, string | undefined>) =>
  [prefix, _objectKey, filename].filter(Boolean).join('/')

type DbMock = ReturnType<typeof vi.fn>

const buildKeysReq = ({
  findOne = vi.fn(async () => null),
  findVersions = vi.fn(async () => ({ docs: [] })),
  versions = { maxPerDoc: 0 },
}: { findOne?: DbMock; findVersions?: DbMock; versions?: false | { maxPerDoc: number } } = {}) => ({
  context: {} as Record<string, unknown>,
  payload: {
    collections: { media: { config: { slug: 'media', upload: { fileOperations: { resolveStorageKey } }, versions } } },
    db: { findOne, findVersions },
    logger: { debug: vi.fn(), error: vi.fn() },
  },
})

const videoDoc = (videoId: string, _objectKey: string) => ({
  _objectKey,
  bunnyData: { stream: { videoId } },
  filename: 'clip-original.mp4',
  original: { _objectKey, filename: 'clip-original.mp4', prefix: 'media' },
  prefix: 'media',
})

describe('stream key hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('remembers the keys of the old and new file before an update', async () => {
    const req = buildKeysReq()
    const originalDoc = { id: 'doc-1', ...videoDoc('v-old', 'a') }
    const data = videoDoc('v-new', 'b')

    await getStreamKeysBeforeChangeHook(buildContext())({ data, operation: 'update', originalDoc, req } as never)

    expect(req.context.bunnyStreamKeys).toEqual(
      new Map([
        [
          'media',
          new Map([
            ['media/a/clip-original.mp4', 'v-old'],
            ['media/b/clip-original.mp4', 'v-new'],
          ]),
        ],
      ]),
    )
    expect(req.payload.db.findVersions).not.toHaveBeenCalled()
  })

  it('remembers the keys of the versions that maxPerDoc prunes', async () => {
    const findVersions = vi
      .fn()
      .mockResolvedValueOnce({ docs: [{ updatedAt: '2026-01-02' }] })
      .mockResolvedValueOnce({ docs: [{ version: videoDoc('v-pruned', 'c') }] })
    const req = buildKeysReq({ findVersions, versions: { maxPerDoc: 2 } })
    const originalDoc = { id: 'doc-1', ...videoDoc('v-old', 'a') }

    await getStreamKeysBeforeChangeHook(buildContext())({ data: {}, operation: 'update', originalDoc, req } as never)

    expect(findVersions).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ limit: 1, page: 2, sort: '-updatedAt', where: { parent: { equals: 'doc-1' } } }),
    )
    expect(findVersions).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { and: [{ parent: { equals: 'doc-1' } }, { updatedAt: { less_than_equal: '2026-01-02' } }] },
      }),
    )
    expect(
      (req.context.bunnyStreamKeys as Map<string, Map<string, string>>).get('media')?.get('media/c/clip-original.mp4'),
    ).toBe('v-pruned')
  })

  it('reads nothing on create', async () => {
    const req = buildKeysReq({ versions: { maxPerDoc: 2 } })

    await getStreamKeysBeforeChangeHook(buildContext())({ data: {}, operation: 'create', req } as never)

    expect(req.payload.db.findVersions).not.toHaveBeenCalled()
    expect(req.context.bunnyStreamKeys).toBeUndefined()
  })

  it('remembers the keys of the document and all its versions before a delete', async () => {
    const findOne = vi.fn(async () => videoDoc('v-main', 'a'))
    const findVersions = vi.fn(async () => ({ docs: [{ version: videoDoc('v-version', 'b') }] }))
    const req = buildKeysReq({ findOne, findVersions, versions: { maxPerDoc: 10 } })

    await getStreamKeysBeforeDeleteHook(buildContext())({ id: 'doc-1', req } as never)

    expect(findVersions).toHaveBeenCalledWith(expect.objectContaining({ where: { parent: { equals: 'doc-1' } } }))
    expect(req.context.bunnyStreamKeys).toEqual(
      new Map([
        [
          'media',
          new Map([
            ['media/a/clip-original.mp4', 'v-main'],
            ['media/b/clip-original.mp4', 'v-version'],
          ]),
        ],
      ]),
    )
  })
})
