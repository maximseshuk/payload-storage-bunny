import { Forbidden, MissingFile, ValidationError } from 'payload'
import { createClientUploadReceipt } from 'payload/internal'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteSessionMock, getSafeFileNameMock, getVideoMock, handleDeleteMock, isProcessedMock, saveStateMock } =
  vi.hoisted(() => ({
    deleteSessionMock: vi.fn(),
    getSafeFileNameMock: vi.fn(),
    getVideoMock: vi.fn(),
    handleDeleteMock: vi.fn(),
    isProcessedMock: vi.fn(),
    saveStateMock: vi.fn(),
  }))

vi.mock('@/server/bunny/stream.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/bunny/stream.js')>()
  saveStateMock.mockImplementation(actual.getStreamSaveState)
  return {
    getStreamSaveState: saveStateMock,
    getStreamVideo: getVideoMock,
    getStreamVideoState: actual.getStreamVideoState,
    isVideoProcessed: isProcessedMock,
  }
})

vi.mock('@/server/payload/stream/sessionsCollection.js', () => ({
  deleteStreamVideoSession: deleteSessionMock,
}))

vi.mock('@/server/payload/storage/handleDelete.js', () => ({
  getHandleDelete: vi.fn(() => handleDeleteMock),
}))

vi.mock('@/server/files.js', () => ({
  getSafeFileName: getSafeFileNameMock,
}))

const { getAfterChangeHook, getBeforeValidateHook, getStreamBeforeChangeHook } =
  await import('@/server/payload/stream/hooks.js')
const { signClientUpload } = await import('@/server/payload/storage/clientUploads/receipt.js')

import type { CollectionContext } from '@/shared/types/index.js'

const buildContext = (overrides: Partial<CollectionContext> = {}): CollectionContext =>
  ({
    collection: { slug: 'media' },
    isTusUploadSupported: false,
    streamOptions: { apiKey: 'stream-key', libraryId: 12345, status: true },
    usePayloadAccessControl: true,
    ...overrides,
  }) as unknown as CollectionContext

const receiptFor = (videoId: string, { collectionSlug = 'media', filename = 'big.mp4' } = {}) =>
  signClientUpload({
    claims: { head: '', videoId },
    collectionSlug,
    filename,
    prefix: '',
    req: { payload: { secret: 'payload-secret' } } as never,
  })

const clientUpload = (signedReceipt?: string) => ({
  name: 'big.mp4',
  uploadReference: { prefix: '', ...(signedReceipt !== undefined && { signedReceipt }) },
})

const emptyOptions = { collections: new Map() } as never

const buildReq = (overrides: Record<string, unknown> = {}) =>
  ({
    payload: {
      collections: { media: { config: { slug: 'media' } } },
      db: { findOne: async () => null },
      logger: { debug: vi.fn(), error: vi.fn() },
      secret: 'payload-secret',
    },
    t: (key: string) => key,
    ...overrides,
  }) as never

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

    it('stores the videoId of a client-direct TUS upload after checking it against the library', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-client', status: 1 })

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: true,
      })
      const file = clientUpload(receiptFor('v-client'))

      const result = (await hook({ data: {}, operation: 'create', req: buildReq({ file }) } as never)) as Record<
        string,
        any
      >

      expect(getVideoMock).toHaveBeenCalledWith({ apiKey: 'stream-key', libraryId: 12345, videoId: 'v-client' })
      expect(result.bunnyData.stream).toEqual({ status: 'processing', videoId: 'v-client' })
    })

    it('stores the resolutions of a client-direct upload that is ready when mp4Fallback is on', async () => {
      const video = { guid: 'v-client', status: 4 }
      const resolutions = { available: ['720p', '360p'], highest: '720p' }
      getVideoMock.mockResolvedValue(video)
      saveStateMock.mockResolvedValueOnce({ resolutions, status: 'ready' })
      const streamOptions = { apiKey: 'stream-key', libraryId: 12345, mp4Fallback: true, status: true }

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({ streamOptions } as never),
        filesRequiredOnCreate: true,
      })
      const req = buildReq({ file: clientUpload(receiptFor('v-client')) })

      const result = (await hook({ data: {}, operation: 'create', req } as never)) as Record<string, any>

      expect(saveStateMock).toHaveBeenCalledWith({
        apiKey: 'stream-key',
        libraryId: 12345,
        logger: (req as any).payload.logger,
        mp4Fallback: true,
        video,
      })
      expect(result.bunnyData.stream).toEqual({ resolutions, status: 'ready', videoId: 'v-client' })
    })

    it('clears the old resolutions on a client-direct upload when the status is turned off and mp4Fallback is on', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-client', status: 4 })

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({
          streamOptions: { apiKey: 'stream-key', libraryId: 12345, mp4Fallback: true, status: false },
        } as never),
        filesRequiredOnCreate: true,
      })
      const data = { bunnyData: { stream: { resolutions: { available: ['720p'] }, videoId: 'v-old' } } }
      const req = buildReq({ file: clientUpload(receiptFor('v-client')) })

      const result = (await hook({ data, operation: 'update', req } as never)) as Record<string, any>

      expect(result.bunnyData.stream).toEqual({ resolutions: null, videoId: 'v-client' })
    })

    it('rejects a client-direct upload whose video is not in the library', async () => {
      getVideoMock.mockRejectedValue(new Error('404'))

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: true,
      })
      const file = clientUpload(receiptFor('missing'))

      await expect(hook({ data: {}, operation: 'create', req: buildReq({ file }) } as never)).rejects.toThrow('404')
    })

    it.each([
      ['no receipt', undefined],
      ['a forged receipt', `${Buffer.from(JSON.stringify({ videoId: 'v-client' })).toString('base64url')}.forged`],
      ['a receipt for another file', receiptFor('v-client', { filename: 'other.mp4' })],
      ['a receipt for another collection', receiptFor('v-client', { collectionSlug: 'other' })],
      [
        'a receipt signed with another secret',
        createClientUploadReceipt({
          collectionSlug: 'media',
          filename: 'big.mp4',
          filePrefix: '',
          req: { payload: { secret: 'other-secret' } } as never,
          storageFilePath: JSON.stringify({ videoId: 'v-client' }),
        }),
      ],
    ])('requires a valid signed receipt for a client-direct upload (%s)', async (_label, signedReceipt) => {
      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: true,
      })
      const file = clientUpload(signedReceipt)

      await expect(hook({ data: {}, operation: 'create', req: buildReq({ file }) } as never)).rejects.toBeInstanceOf(
        Forbidden,
      )
      expect(getVideoMock).not.toHaveBeenCalled()
    })

    it('processes a TUS video on create when a videoId is supplied without a file', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-123', status: 4, storageSize: 4096, title: 'Great Video' })
      isProcessedMock.mockReturnValue(true)
      getSafeFileNameMock.mockResolvedValue('great-video.mp4')

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: true,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-123' } } }

      const result = (await hook({ data, operation: 'create', req: buildReq() } as never)) as Record<string, any>

      expect(result.filename).toBe('great-video.mp4')
      expect(result.width).toBeNull()
      expect(result.mimeType).toBe('video/mp4')
      expect(result.filesize).toBe(4096)
      expect(result.bunnyData.stream).toEqual({ status: 'ready', videoId: 'v-123' })
    })

    it('stores the resolutions of a ready video set by videoId when mp4Fallback is on', async () => {
      const resolutions = { available: ['1080p'], highest: '1080p' }
      getVideoMock.mockResolvedValue({ guid: 'v-123', status: 4, storageSize: 1, title: 'Ready' })
      isProcessedMock.mockReturnValue(true)
      getSafeFileNameMock.mockResolvedValue('ready.mp4')
      saveStateMock.mockResolvedValueOnce({ resolutions, status: 'ready' })

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({
          streamOptions: { apiKey: 'stream-key', libraryId: 12345, mp4Fallback: true, status: true },
        } as never),
        filesRequiredOnCreate: true,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-123' } } }

      const result = (await hook({ data, operation: 'create', req: buildReq() } as never)) as Record<string, any>

      expect(saveStateMock).toHaveBeenCalledWith(expect.objectContaining({ mp4Fallback: true }))
      expect(result.bunnyData.stream).toEqual({ resolutions, status: 'ready', videoId: 'v-123' })
    })

    it('processes a changed videoId on update and keeps the old doc', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-new', status: 4, storageSize: 100, title: 'New' })
      isProcessedMock.mockReturnValue(true)
      getSafeFileNameMock.mockResolvedValue('new.mp4')

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-new' } } }
      const originalDoc = { bunnyData: { stream: { videoId: 'v-old' } }, filename: 'old.mp4' }
      const req = buildReq()

      await hook({ data, operation: 'update', originalDoc, req } as never)

      expect((req as any).context.oldDoc).toBe(originalDoc)
      expect(getVideoMock).toHaveBeenCalled()
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

      await hook({ data, operation: 'update', originalDoc, req } as never)

      expect((req as any).context.oldDoc).toBeUndefined()
      expect(getVideoMock).not.toHaveBeenCalled()
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

    it('leaves filename untouched when the video is not yet processed', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-123', status: 0, title: 'Pending' })
      isProcessedMock.mockReturnValue(false)

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-123' } } }

      const result = (await hook({ data, operation: 'create', req: buildReq() } as never)) as Record<string, any>

      expect(getVideoMock).toHaveBeenCalled()
      expect(getSafeFileNameMock).not.toHaveBeenCalled()
      expect(result.filename).toBeUndefined()
    })

    it('gives a document with a non-Stream file the video type and size when a new video is set without a file', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-new', status: 1, storageSize: 0, title: 'Pending' })
      isProcessedMock.mockReturnValue(false)

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
      isProcessedMock.mockReturnValue(false)

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
      isProcessedMock.mockReturnValue(false)
      const oldResolutions = { available: ['720p'], highest: '720p' }

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({
          streamOptions: { apiKey: 'stream-key', libraryId: 12345, mp4Fallback: true, status: true },
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
          streamOptions: { apiKey: 'stream-key', libraryId: 12345, mp4Fallback: true, status: true },
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
      isProcessedMock.mockReturnValue(true)
      getSafeFileNameMock.mockResolvedValue('great-video.mp4')

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({ streamOptions: { apiKey: 'stream-key', libraryId: 12345, status: false } as never }),
        filesRequiredOnCreate: true,
      })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-123' } } }

      const result = (await hook({ data, operation: 'create', req: buildReq() } as never)) as Record<string, any>

      expect(result.bunnyData.stream).toEqual({ videoId: 'v-123' })
      expect(saveStateMock).not.toHaveBeenCalled()
    })

    it('clears the old resolutions of a replaced video when the status is turned off and mp4Fallback is on', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-new', status: 2, title: 'Pending' })
      isProcessedMock.mockReturnValue(false)
      const oldResolutions = { available: ['720p'], highest: '720p' }

      const hook = getBeforeValidateHook({
        options: emptyOptions,
        context: buildContext({
          streamOptions: { apiKey: 'stream-key', libraryId: 12345, mp4Fallback: true, status: false },
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
      const originalDoc = { bunnyData: { stream: { videoId: 'v-same' } }, filename: 'same.mp4' }

      await hook({ data, operation: 'update', originalDoc, req: buildReq() } as never)

      expect(getVideoMock).not.toHaveBeenCalled()
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

    const buildOwnershipReq = (owners: Record<string, string>) => {
      const findOne = vi.fn(async ({ collection, where }: any) => {
        const [videoClause, idClause] = where.and
        const ownerId = owners[collection]
        const matches =
          ownerId !== undefined &&
          videoClause['bunnyData.stream.videoId'].equals === 'v-shared' &&
          ownerId !== idClause?.id.not_equals
        return matches ? { id: ownerId } : null
      })
      const req = buildReq({
        payload: {
          collections: {
            clips: { config: { slug: 'clips' } },
            files: { config: { slug: 'files' } },
            media: { config: { slug: 'media' } },
            other: { config: { slug: 'other' } },
          },
          db: { findOne },
          logger: { debug: vi.fn(), error: vi.fn() },
          secret: 'payload-secret',
        },
      })
      return { findOne, req }
    }

    const sharedData = () => ({ bunnyData: { stream: { videoId: 'v-shared' } } })

    it.each([
      ['another document of the same collection', { media: 'doc-1' }],
      ['a document of another Stream collection in the same library', { clips: 'doc-9' }],
    ])('rejects a videoId already used by %s', async (_label, owners) => {
      const hook = getBeforeValidateHook({
        options: libraryOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const { req } = buildOwnershipReq(owners)

      await expect(hook({ data: sharedData(), operation: 'create', req } as never)).rejects.toBeInstanceOf(
        ValidationError,
      )
      expect(getVideoMock).not.toHaveBeenCalled()
    })

    it('rejects a client-direct upload of a video another document already uses', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-shared', status: 1 })
      const hook = getBeforeValidateHook({
        options: libraryOptions,
        context: buildContext(),
        filesRequiredOnCreate: true,
      })
      const { req } = buildOwnershipReq({ clips: 'doc-9' })
      Object.assign(req, { file: clientUpload(receiptFor('v-shared')) })

      await expect(hook({ data: {}, operation: 'create', req } as never)).rejects.toBeInstanceOf(ValidationError)
    })

    it('searches only stream collections of the same library', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-shared', status: 0 })
      const hook = getBeforeValidateHook({
        options: libraryOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const { findOne, req } = buildOwnershipReq({ files: 'doc-3', other: 'doc-2' })

      await hook({ data: sharedData(), operation: 'create', req } as never)

      expect(findOne.mock.calls.map(([args]: any) => args.collection).toSorted()).toEqual(['clips', 'media'])
    })

    it('ignores the document being updated', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-shared', status: 0 })
      const hook = getBeforeValidateHook({
        options: libraryOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const { req } = buildOwnershipReq({ media: 'doc-1' })
      const originalDoc = { bunnyData: { stream: { videoId: 'v-draft' } }, id: 'doc-1' }

      await expect(hook({ data: sharedData(), operation: 'update', originalDoc, req } as never)).resolves.toBeDefined()
    })

    it('does not look up an unchanged videoId', async () => {
      const hook = getBeforeValidateHook({
        options: libraryOptions,
        context: buildContext(),
        filesRequiredOnCreate: false,
      })
      const { findOne, req } = buildOwnershipReq({ media: 'doc-1' })
      const originalDoc = { bunnyData: { stream: { videoId: 'v-shared' } }, id: 'doc-2' }

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

    it('deletes the old file after a TUS upload replaces it', async () => {
      const req = buildReq({ context: { oldDoc: { filename: 'old.mp4', id: 'doc-1' } } })
      const hook = getAfterChangeHook(buildContext({ isTusUploadSupported: true }))

      await hook({ data: {}, req } as never)

      expect(handleDeleteMock).toHaveBeenCalledWith(expect.objectContaining({ filename: 'old.mp4' }))
      expect((req as any).payload.logger.debug).toHaveBeenCalled()
    })

    it('does nothing for a TUS upload without a valid old doc', async () => {
      const hook = getAfterChangeHook(buildContext({ isTusUploadSupported: true }))
      await hook({ data: {}, req: buildReq({ context: {} }) } as never)

      expect(handleDeleteMock).not.toHaveBeenCalled()
    })

    it('logs delete errors without throwing', async () => {
      handleDeleteMock.mockRejectedValueOnce(new Error('boom'))
      const req = buildReq({ context: { oldDoc: { filename: 'old.mp4', id: 'doc-1' } } })
      const hook = getAfterChangeHook(buildContext({ isTusUploadSupported: true }))

      await expect(hook({ data: {}, req } as never)).resolves.toBeUndefined()
      expect((req as any).payload.logger.error).toHaveBeenCalled()
    })

    it('does nothing when TUS is not supported and cleanup is off', async () => {
      const hook = getAfterChangeHook(buildContext())
      await hook({ data: { bunnyData: { stream: { videoId: 'v1' } } }, req: buildReq() } as never)

      expect(deleteSessionMock).not.toHaveBeenCalled()
      expect(handleDeleteMock).not.toHaveBeenCalled()
    })
  })
})
