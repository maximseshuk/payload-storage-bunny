import { MissingFile } from 'payload'
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

import type { CollectionContext } from '@/shared/types/index.js'

const buildContext = (overrides: Partial<CollectionContext> = {}): CollectionContext =>
  ({
    collection: { slug: 'media' },
    isTusUploadSupported: false,
    streamConfig: { apiKey: 'stream-key', libraryId: 12345 },
    usePayloadAccessControl: true,
    ...overrides,
  }) as unknown as CollectionContext

const buildReq = (overrides: Record<string, unknown> = {}) =>
  ({
    payload: { logger: { debug: vi.fn(), error: vi.fn() } },
    t: (key: string) => key,
    ...overrides,
  }) as never

describe('stream hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getBeforeValidateHook', () => {
    it('throws MissingFile when a create requires a file and none is present', async () => {
      const hook = getBeforeValidateHook({ context: buildContext(), filesRequiredOnCreate: true })
      await expect(hook({ data: {}, operation: 'create', req: buildReq() } as never)).rejects.toBeInstanceOf(
        MissingFile,
      )
    })

    it('nulls out the videoId on a normal create with a file', async () => {
      const hook = getBeforeValidateHook({ context: buildContext(), filesRequiredOnCreate: true })
      const data: Record<string, unknown> = {}

      const result = (await hook({
        data,
        operation: 'create',
        req: buildReq({ file: { name: 'a.jpg' } }),
      } as never)) as Record<string, any>

      expect(result.bunnyData.stream.videoId).toBeNull()
      expect(getVideoMock).not.toHaveBeenCalled()
    })

    it('processes a TUS video on create when a videoId is supplied without a file', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-123', status: 4, storageSize: 4096, title: 'Great Video' })
      isProcessedMock.mockReturnValue(true)
      getSafeFileNameMock.mockResolvedValue('great-video.mp4')

      const hook = getBeforeValidateHook({ context: buildContext(), filesRequiredOnCreate: true })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-123' } } }

      const result = (await hook({ data, operation: 'create', req: buildReq() } as never)) as Record<string, any>

      expect(result.filename).toBe('great-video.mp4')
      expect(result.width).toBeNull()
      expect(result.mimeType).toBe('video/mp4')
      expect(result.filesize).toBe(4096)
      expect(result.bunnyData.stream.videoId).toBe('v-123')
    })

    it('processes a changed videoId on update and stashes the old doc', async () => {
      getVideoMock.mockResolvedValue({ guid: 'v-new', status: 4, storageSize: 100, title: 'New' })
      isProcessedMock.mockReturnValue(true)
      getSafeFileNameMock.mockResolvedValue('new.mp4')

      const hook = getBeforeValidateHook({ context: buildContext(), filesRequiredOnCreate: false })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-new' } } }
      const originalDoc = { bunnyData: { stream: { videoId: 'v-old' } }, filename: 'old.mp4' }
      const req = buildReq()

      await hook({ data, operation: 'update', originalDoc, req } as never)

      expect((req as any).context.oldDoc).toBe(originalDoc)
      expect(getVideoMock).toHaveBeenCalled()
    })

    it('skips processing when the context has no stream config', async () => {
      const hook = getBeforeValidateHook({
        context: buildContext({ streamConfig: undefined }),
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

      const hook = getBeforeValidateHook({ context: buildContext(), filesRequiredOnCreate: false })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-123' } } }

      const result = (await hook({ data, operation: 'create', req: buildReq() } as never)) as Record<string, any>

      expect(getVideoMock).toHaveBeenCalled()
      expect(getSafeFileNameMock).not.toHaveBeenCalled()
      expect(result.filename).toBeUndefined()
    })

    it('does not reprocess when the update videoId is unchanged', async () => {
      const hook = getBeforeValidateHook({ context: buildContext(), filesRequiredOnCreate: false })
      const data: Record<string, unknown> = { bunnyData: { stream: { videoId: 'v-same' } } }
      const originalDoc = { bunnyData: { stream: { videoId: 'v-same' } }, filename: 'same.mp4' }

      await hook({ data, operation: 'update', originalDoc, req: buildReq() } as never)

      expect(getVideoMock).not.toHaveBeenCalled()
    })
  })

  describe('getAfterChangeHook', () => {
    it('deletes the upload session when cleanup is enabled and a videoId exists', async () => {
      const hook = getAfterChangeHook(
        buildContext({ streamConfig: { apiKey: 'k', cleanup: true, libraryId: 12345 } as never }),
      )
      await hook({ data: { bunnyData: { stream: { videoId: 'v1' } } }, req: buildReq() } as never)

      expect(deleteSessionMock).toHaveBeenCalledWith(expect.objectContaining({ libraryId: 12345, videoId: 'v1' }))
    })

    it('deletes the old file after a TUS upload replaces it', async () => {
      const req = buildReq({ context: { oldDoc: { filename: 'old.mp4', id: 'doc-1' } } })
      const hook = getAfterChangeHook(buildContext({ isTusUploadSupported: true }))

      await hook({ data: {}, req } as never)

      expect(handleDeleteMock).toHaveBeenCalledWith(expect.objectContaining({ filename: 'old.mp4' }))
      expect((req as any).payload.logger.debug).toHaveBeenCalled()
    })

    it('is a no-op for a TUS upload without a valid old doc', async () => {
      const hook = getAfterChangeHook(buildContext({ isTusUploadSupported: true }))
      await hook({ data: {}, req: buildReq({ context: {} }) } as never)

      expect(handleDeleteMock).not.toHaveBeenCalled()
    })

    it('logs and swallows errors thrown by the delete', async () => {
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
