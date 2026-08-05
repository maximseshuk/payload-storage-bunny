import type { CollectionConfig } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CollectionContext } from '@/shared/types/index.js'

import { httpError } from '../../../../helpers/unit/httpError.js'

const { getBunnyDataMock, storageHandlerMock, streamHandlerMock, thumbnailHandlerMock } = vi.hoisted(() => ({
  getBunnyDataMock: vi.fn(),
  storageHandlerMock: vi.fn(),
  streamHandlerMock: vi.fn(),
  thumbnailHandlerMock: vi.fn(),
}))

vi.mock('@/server/payload/fields/bunnyGroupField.js', () => ({ getBunnyData: getBunnyDataMock }))
vi.mock('@/server/payload/storage/serveFile.js', () => ({ storageStaticHandler: storageHandlerMock }))
vi.mock('@/server/payload/stream/serveStream.js', () => ({ streamStaticHandler: streamHandlerMock }))
vi.mock('@/server/payload/stream/serveThumbnail.js', () => ({ streamThumbnailStaticHandler: thumbnailHandlerMock }))

type LooseReq = { payload: { find: ReturnType<typeof vi.fn>; logger: { error: ReturnType<typeof vi.fn> } } }

const { getStaticHandler: rawGetStaticHandler } = await import('@/server/payload/storage/staticHandler.js')

const getStaticHandler = rawGetStaticHandler as unknown as (ctx: CollectionContext) => (
  req: LooseReq,
  args: {
    doc?: unknown
    params: { clientUploadContext?: unknown; filename: string; prefix?: string }
  },
) => Promise<Response>

const collection = { slug: 'media' } as unknown as CollectionConfig

const context = (over: Partial<CollectionContext> = {}): CollectionContext =>
  ({
    collection,
    isTusUploadSupported: false,
    prefix: '',
    storageConfig: { apiKey: 'k', hostname: 'cdn.b-cdn.net', uploadTimeout: 60000, zoneName: 'z' },
    streamConfig: {
      apiKey: 's',
      hostname: 'stream.b-cdn.net',
      libraryId: 1,
      mimeTypes: [],
      mp4Fallback: true,
      uploadTimeout: 1,
    },
    usePayloadAccessControl: true,
    ...over,
  }) as unknown as CollectionContext

const makeReq = (findResult: { docs: unknown[] } = { docs: [] }): LooseReq => ({
  payload: { find: vi.fn().mockResolvedValue(findResult), logger: { error: vi.fn() } },
})

beforeEach(() => {
  getBunnyDataMock.mockReset().mockReturnValue(null)
  storageHandlerMock.mockReset().mockResolvedValue(new Response('storage', { status: 200 }))
  streamHandlerMock.mockReset().mockResolvedValue(new Response('stream', { status: 200 }))
  thumbnailHandlerMock.mockReset().mockResolvedValue(new Response('thumb', { status: 200 }))
})

describe('getStaticHandler dispatch', () => {
  it('routes a bunny:stream thumbnail.jpg filename to the thumbnail handler', async () => {
    const handler = getStaticHandler(context())
    const res = await handler(makeReq(), { doc: undefined, params: { filename: 'bunny:stream:vid1:thumbnail.jpg' } })

    expect(await res.text()).toBe('thumb')
    expect(thumbnailHandlerMock).toHaveBeenCalledWith(
      expect.objectContaining({ thumbnailType: 'thumbnail.jpg', videoId: 'vid1' }),
    )
  })

  it('routes a bunny:stream preview.webp filename to the thumbnail handler', async () => {
    const handler = getStaticHandler(context())
    await handler(makeReq(), { doc: undefined, params: { filename: 'bunny:stream:vid9:preview.webp' } })

    expect(thumbnailHandlerMock).toHaveBeenCalledWith(
      expect.objectContaining({ thumbnailType: 'preview.webp', videoId: 'vid9' }),
    )
  })

  it('serves stream directly when the doc already carries matching bunnyData', async () => {
    getBunnyDataMock.mockReturnValue({ stream: { videoId: 'vid1' } })
    const req = makeReq()
    const handler = getStaticHandler(context())

    const res = await handler(req, { doc: { filename: 'video.mp4', id: 'doc1' }, params: { filename: 'video.mp4' } })

    expect(await res.text()).toBe('stream')
    expect(req.payload.find).not.toHaveBeenCalled()
    expect(streamHandlerMock).toHaveBeenCalledWith(expect.objectContaining({ docId: 'doc1' }))
  })

  it('looks the video up by filename when the doc lacks bunnyData', async () => {
    getBunnyDataMock.mockReturnValueOnce(null).mockReturnValueOnce({ stream: { videoId: 'vid2' } })
    const req = makeReq({ docs: [{ filename: 'video.mp4', id: 'found1' }] })
    const handler = getStaticHandler(context())

    const res = await handler(req, { doc: undefined, params: { filename: 'video.mp4' } })

    expect(await res.text()).toBe('stream')
    expect(req.payload.find).toHaveBeenCalled()
    expect(streamHandlerMock).toHaveBeenCalledWith(expect.objectContaining({ docId: 'found1' }))
  })

  it('falls through to storage when no stream video is found', async () => {
    const handler = getStaticHandler(context())
    const res = await handler(makeReq(), { doc: undefined, params: { filename: 'photo.jpg' } })

    expect(await res.text()).toBe('storage')
    expect(streamHandlerMock).not.toHaveBeenCalled()
    expect(storageHandlerMock).toHaveBeenCalledWith(expect.objectContaining({ filename: 'photo.jpg' }))
  })

  it('serves storage directly when stream is not configured', async () => {
    const handler = getStaticHandler(context({ streamConfig: undefined }))
    const res = await handler(makeReq(), { doc: undefined, params: { filename: 'photo.jpg' } })

    expect(await res.text()).toBe('storage')
    expect(getBunnyDataMock).not.toHaveBeenCalled()
  })

  it('returns 404 when neither stream nor storage is configured', async () => {
    const handler = getStaticHandler(context({ storageConfig: undefined, streamConfig: undefined }))
    const res = await handler(makeReq(), { doc: undefined, params: { filename: 'photo.jpg' } })

    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Storage not configured')
  })

  it('maps an upstream HTTPError 404 to a 404 response', async () => {
    storageHandlerMock.mockRejectedValue(httpError(404))
    const req = makeReq()
    const handler = getStaticHandler(context({ streamConfig: undefined }))

    const res = await handler(req, { doc: undefined, params: { filename: 'photo.jpg' } })

    expect(res.status).toBe(404)
    expect(res.statusText).toBe('Not Found')
    expect(req.payload.logger.error).toHaveBeenCalled()
  })

  it('maps a non-404 HTTPError to a 500 response', async () => {
    storageHandlerMock.mockRejectedValue(httpError(500))
    const handler = getStaticHandler(context({ streamConfig: undefined }))

    const res = await handler(makeReq(), { doc: undefined, params: { filename: 'photo.jpg' } })

    expect(res.status).toBe(500)
    expect(res.statusText).toBe('Internal Server Error')
  })

  it('maps a generic error to a 500 response', async () => {
    storageHandlerMock.mockRejectedValue(new Error('boom'))
    const req = makeReq()
    const handler = getStaticHandler(context({ streamConfig: undefined }))

    const res = await handler(req, { doc: undefined, params: { filename: 'photo.jpg' } })

    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Internal Server Error')
    expect(req.payload.logger.error).toHaveBeenCalled()
  })
})

const prefixCollection = {
  slug: 'media',
  fields: [{ name: 'prefix', type: 'text' }],
} as unknown as CollectionConfig

describe('getStaticHandler storage prefix resolution', () => {
  it('uses params.prefix over everything else', async () => {
    const req = makeReq()
    const handler = getStaticHandler(context({ streamConfig: undefined }))

    await handler(req, {
      doc: { prefix: 'doc/pre' },
      params: { clientUploadContext: { prefix: 'ctx/pre' }, filename: 'photo.jpg', prefix: 'query/pre' },
    })

    expect(storageHandlerMock).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'query/pre' }))
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('uses clientUploadContext.prefix on a read-back (doc: null, no param)', async () => {
    const req = makeReq()
    const handler = getStaticHandler(context({ streamConfig: undefined }))

    await handler(req, {
      doc: null,
      params: { clientUploadContext: { prefix: 'tenants/acme' }, filename: 'photo.jpg' },
    })

    expect(storageHandlerMock).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'tenants/acme' }))
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('uses doc.prefix when no param or clientUploadContext is present', async () => {
    const req = makeReq()
    const handler = getStaticHandler(context({ streamConfig: undefined }))

    await handler(req, { doc: { prefix: 'tenants/beta/media' }, params: { filename: 'photo.jpg' } })

    expect(storageHandlerMock).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'tenants/beta/media' }))
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('falls back to a gated DB find when the collection has a prefix field', async () => {
    const req = makeReq({ docs: [{ prefix: 'tenants/db/media' }] })
    const handler = getStaticHandler(context({ collection: prefixCollection, streamConfig: undefined }))

    await handler(req, { doc: undefined, params: { filename: 'photo.jpg' } })

    expect(req.payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'media',
        draft: true,
        where: { or: expect.arrayContaining([{ filename: { equals: 'photo.jpg' } }]) },
      }),
    )
    expect(storageHandlerMock).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'tenants/db/media' }))
  })

  it('skips the DB find and uses the static fallback prefix when no prefix field exists', async () => {
    const req = makeReq()
    const handler = getStaticHandler(context({ prefix: 'static-pre', streamConfig: undefined }))

    await handler(req, { doc: undefined, params: { filename: 'photo.jpg' } })

    expect(req.payload.find).not.toHaveBeenCalled()
    expect(storageHandlerMock).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'static-pre' }))
  })

  it('sanitizes a traversal attempt in the prefix query param', async () => {
    const req = makeReq()
    const handler = getStaticHandler(context({ streamConfig: undefined }))

    await handler(req, { doc: undefined, params: { filename: 'photo.jpg', prefix: '../%2e%2e/secret' } })

    const passedPrefix = storageHandlerMock.mock.calls[0][0].prefix as string
    expect(passedPrefix).not.toContain('..')
    expect(passedPrefix).toBe('secret')
  })
})
