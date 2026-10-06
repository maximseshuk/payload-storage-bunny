import { Forbidden, MissingFile, ValidationError } from 'payload'
import { createClientUploadReceipt } from 'payload/internal'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteSessionMock, getSafeFileNameMock, getVideoMock, handleDeleteMock, isProcessedMock } = vi.hoisted(() => ({
  deleteSessionMock: vi.fn(),
  getSafeFileNameMock: vi.fn(),
  getVideoMock: vi.fn(),
  handleDeleteMock: vi.fn(),
  isProcessedMock: vi.fn(),
}))

vi.mock('@/server/bunny/stream.js', () => ({
  getStreamVideo: getVideoMock,
  isVideoProcessed: isProcessedMock,
}))

vi.mock('@/server/payload/stream/sessionsCollection.js', () => ({
  deleteStreamVideoSession: deleteSessionMock,
}))

vi.mock('@/server/payload/storage/handleDelete.js', () => ({
  getHandleDelete: vi.fn(() => handleDeleteMock),
}))

vi.mock('@/server/files.js', () => ({
  getSafeFileName: getSafeFileNameMock,
}))

const { getAfterChangeHook, getBeforeValidateHook } = await import('@/server/payload/stream/hooks.js')
const { signClientUpload } = await import('@/server/payload/storage/clientUploads/receipt.js')

import type { CollectionContext } from '@/shared/types/index.js'

const buildContext = (overrides: Partial<CollectionContext> = {}): CollectionContext =>
  ({
    collection: { slug: 'media' },
    isTusUploadSupported: false,
    streamOptions: { apiKey: 'stream-key', libraryId: 12345 },
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
      expect(result.bunnyData.stream.videoId).toBe('v-client')
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
      expect(result.bunnyData.stream.videoId).toBe('v-123')
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
