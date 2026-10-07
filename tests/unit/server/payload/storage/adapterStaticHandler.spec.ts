import type { CollectionConfig } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CollectionContext } from '@/shared/types/index.js'

import { httpError } from '../../../../helpers/unit/httpError.js'

const { getBunnyDataMock, getUploadOffsetMock, getVideoMock, storageHandlerMock, streamHandlerMock } = vi.hoisted(
  () => ({
    getBunnyDataMock: vi.fn(),
    getUploadOffsetMock: vi.fn(),
    getVideoMock: vi.fn(),
    storageHandlerMock: vi.fn(),
    streamHandlerMock: vi.fn(),
  }),
)

vi.mock('@/server/payload/fields/bunnyGroupField.js', () => ({ getBunnyData: getBunnyDataMock }))
vi.mock('@/server/payload/storage/serveFile.js', () => ({ storageStaticHandler: storageHandlerMock }))
vi.mock('@/server/payload/stream/serveStream.js', () => ({ streamStaticHandler: streamHandlerMock }))
vi.mock('@/server/bunny/stream.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/bunny/stream.js')>()),
  getStreamTusUploadOffset: getUploadOffsetMock,
  getStreamVideo: getVideoMock,
}))

type LooseReq = {
  context?: Record<string, unknown>
  payload: {
    config: { upload: { transformers?: unknown[] } }
    find: ReturnType<typeof vi.fn>
    logger: { error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> }
    secret: string
  }
}

const { getStaticHandler: rawGetStaticHandler } = await import('@/server/payload/storage/staticHandler.js')
const getStaticHandler = rawGetStaticHandler as unknown as (ctx: CollectionContext) => (
  req: LooseReq,
  args: {
    doc?: unknown
    params: { filename: string; prefix?: string; uploadReference?: unknown }
  },
) => Promise<Response>

const collection = { slug: 'media' } as unknown as CollectionConfig

const context = (over: Partial<CollectionContext> = {}): CollectionContext =>
  ({
    collection,
    isTusUploadSupported: false,
    prefix: '',
    storageOptions: { apiKey: 'k', hostname: 'cdn.b-cdn.net', uploadTimeout: 60000, zoneName: 'z' },
    streamOptions: {
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

const makeReq = (findResult: { docs: unknown[] } = { docs: [] }, transformers?: unknown[]): LooseReq => ({
  payload: {
    config: { upload: { transformers } },
    find: vi.fn().mockResolvedValue(findResult),
    logger: { error: vi.fn(), warn: vi.fn() },
    secret: 'payload-secret',
  },
})

beforeEach(() => {
  getBunnyDataMock.mockReset().mockReturnValue(null)
  storageHandlerMock.mockReset().mockResolvedValue(new Response('storage', { status: 200 }))
  streamHandlerMock.mockReset().mockResolvedValue(new Response('stream', { status: 200 }))
})

const uploadUrl = 'https://video.bunnycdn.com/tusupload/upload-token'
const uploaded = (status: number) => ({
  guid: 'vid1',
  metaTags: [
    { property: 'payload-storage-bunny:upload-url', value: uploadUrl },
    { property: 'payload-storage-bunny:upload-length', value: '2048' },
  ],
  status,
})

describe('getStaticHandler dispatch', () => {
  it('answers the upload probe with the length of the finished server-created upload and falls back to storage for other references', async () => {
    const streamClient = context({
      isTusUploadSupported: true,
      storageOptions: { ...context().storageOptions!, clientUploads: { edge: {} } } as never,
    })
    const handler = getStaticHandler(streamClient)
    const params = { filename: 'clip-original.mp4', uploadReference: { _objectKey: 'vid1', signedReceipt: 'r' } }

    getVideoMock.mockResolvedValueOnce(uploaded(0))
    getUploadOffsetMock.mockResolvedValueOnce({ length: 2048, offset: 2048 })
    const req = makeReq()
    const probe = await handler(req, { params })
    expect(probe.status).toBe(206)
    expect(probe.headers.get('Content-Range')).toBe('bytes 0-0/2048')
    expect(getUploadOffsetMock).toHaveBeenCalledWith({
      headers: expect.objectContaining({ LibraryId: '1', VideoId: 'vid1' }),
      uploadUrl,
    })
    expect(req.context?.bunnyVerifiedStreamUpload).toBe('vid1')
    expect(storageHandlerMock).not.toHaveBeenCalled()

    getVideoMock.mockResolvedValueOnce(uploaded(3))
    getUploadOffsetMock.mockRejectedValueOnce(new Error('gone', { cause: httpError(404) }))
    const expired = await handler(makeReq(), { params })
    expect(expired.status).toBe(206)
    expect(expired.headers.get('Content-Range')).toBe('bytes 0-0/2048')

    getVideoMock.mockRejectedValueOnce(new Error('not found', { cause: httpError(404) }))
    expect(await (await handler(makeReq(), { params })).text()).toBe('storage')

    getVideoMock.mockClear()
    await getStaticHandler(context())(makeReq(), { params })
    expect(getVideoMock).not.toHaveBeenCalled()
  })

  it('rejects the upload probe when the upload is unfinished, failed, unknown or not created by the server', async () => {
    const handler = getStaticHandler(context({ isTusUploadSupported: true, storageOptions: undefined }))
    const params = { filename: 'clip-original.mp4', uploadReference: { _objectKey: 'vid1', signedReceipt: 'r' } }
    const probe = async () => {
      const req = makeReq()
      const res = await handler(req, { params })
      expect(req.context?.bunnyVerifiedStreamUpload).toBeUndefined()
      return { msg: req.payload.logger.warn.mock.calls[0]?.[0]?.msg, status: res.status }
    }

    getVideoMock.mockResolvedValueOnce(uploaded(2))
    getUploadOffsetMock.mockResolvedValueOnce({ length: 2048, offset: 1024 })
    expect(await probe()).toEqual({ msg: '[bunny:stream] upload: the upload has not finished yet', status: 400 })

    getUploadOffsetMock.mockClear()
    getVideoMock.mockResolvedValueOnce(uploaded(6))
    expect(await probe()).toEqual({
      msg: '[bunny:stream] upload: Bunny Stream marked the upload as failed',
      status: 400,
    })
    expect(getUploadOffsetMock).not.toHaveBeenCalled()

    getVideoMock.mockResolvedValueOnce({ metaTags: null, status: 2 })
    expect(await probe()).toEqual({
      msg: '[bunny:stream] upload: the video has no upload created by the server',
      status: 400,
    })

    getVideoMock.mockResolvedValueOnce(uploaded(0))
    getUploadOffsetMock.mockRejectedValueOnce(new Error('gone', { cause: httpError(404) }))
    expect(await probe()).toEqual({ msg: '[bunny:stream] upload: Bunny Stream does not know the upload', status: 400 })

    getVideoMock.mockResolvedValueOnce(uploaded(2))
    getUploadOffsetMock.mockRejectedValueOnce(new Error('down', { cause: httpError(503) }))
    expect((await handler(makeReq(), { params })).status).toBe(500)
  })

  it('reads the file from storage when the Stream check fails in a collection with storage client uploads', async () => {
    const handler = getStaticHandler(
      context({
        isTusUploadSupported: true,
        storageOptions: { ...context().storageOptions!, clientUploads: { edge: {} } } as never,
      }),
    )
    const params = { filename: 'photo.jpg', uploadReference: { _objectKey: 'key1', signedReceipt: 'r' } }

    getVideoMock.mockRejectedValueOnce(new Error('bad request', { cause: httpError(400) }))
    const req = makeReq()
    expect(await (await handler(req, { params })).text()).toBe('storage')
    expect(req.payload.logger.warn).toHaveBeenCalled()
  })

  it('skips the Stream probe when an upload transformer needs the whole file', async () => {
    const handler = getStaticHandler(
      context({
        isTusUploadSupported: true,
        storageOptions: { ...context().storageOptions!, clientUploads: { edge: {} } } as never,
      }),
    )
    const params = { filename: 'clip-original.mp4', uploadReference: { _objectKey: 'vid1', signedReceipt: 'r' } }

    getVideoMock.mockClear()
    const transformer = { mimeTypes: ['*/*'], name: 'watermark', transformFile: vi.fn() }
    expect(await (await handler(makeReq({ docs: [] }, [transformer]), { params })).text()).toBe('storage')
    expect(getVideoMock).not.toHaveBeenCalled()
  })

  it('no longer serves a synthetic bunny:stream thumbnail filename', async () => {
    const handler = getStaticHandler(context())
    await handler(makeReq(), { doc: undefined, params: { filename: 'bunny:stream:vid1:thumbnail.jpg' } })

    expect(streamHandlerMock).not.toHaveBeenCalled()
    expect(storageHandlerMock).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'bunny:stream:vid1:thumbnail.jpg' }),
    )
  })

  it('serves the stream directly when the doc already has matching bunnyData', async () => {
    getBunnyDataMock.mockReturnValue({ stream: { videoId: 'vid1' } })
    const req = makeReq()
    const handler = getStaticHandler(context())

    const res = await handler(req, { doc: { filename: 'video.mp4', id: 'doc1' }, params: { filename: 'video.mp4' } })

    expect(await res.text()).toBe('stream')
    expect(req.payload.find).not.toHaveBeenCalled()
    expect(streamHandlerMock).toHaveBeenCalledWith(expect.objectContaining({ docId: 'doc1' }))
  })

  it('looks up the video by filename when the doc has no bunnyData', async () => {
    getBunnyDataMock.mockReturnValueOnce(null).mockReturnValueOnce({ stream: { videoId: 'vid2' } })
    const req = makeReq({ docs: [{ filename: 'video.mp4', id: 'found1' }] })
    const handler = getStaticHandler(context())

    const res = await handler(req, { doc: undefined, params: { filename: 'video.mp4' } })

    expect(await res.text()).toBe('stream')
    expect(req.payload.find).toHaveBeenCalled()
    expect(streamHandlerMock).toHaveBeenCalledWith(expect.objectContaining({ docId: 'found1' }))
  })

  it('falls back to storage when no Stream video is found', async () => {
    const handler = getStaticHandler(context())
    const res = await handler(makeReq(), { doc: undefined, params: { filename: 'photo.jpg' } })

    expect(await res.text()).toBe('storage')
    expect(streamHandlerMock).not.toHaveBeenCalled()
    expect(storageHandlerMock).toHaveBeenCalledWith(expect.objectContaining({ filename: 'photo.jpg' }))
  })

  it('serves storage directly when stream is not configured', async () => {
    const handler = getStaticHandler(context({ streamOptions: undefined }))
    const res = await handler(makeReq(), { doc: undefined, params: { filename: 'photo.jpg' } })

    expect(await res.text()).toBe('storage')
    expect(getBunnyDataMock).not.toHaveBeenCalled()
  })

  it('returns 404 when neither stream nor storage is configured', async () => {
    const handler = getStaticHandler(context({ storageOptions: undefined, streamOptions: undefined }))
    const res = await handler(makeReq(), { doc: undefined, params: { filename: 'photo.jpg' } })

    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Storage not configured')
  })

  it('maps an upstream HTTPError 404 to a 404 response', async () => {
    storageHandlerMock.mockRejectedValue(httpError(404))
    const req = makeReq()
    const handler = getStaticHandler(context({ streamOptions: undefined }))

    const res = await handler(req, { doc: undefined, params: { filename: 'photo.jpg' } })

    expect(res.status).toBe(404)
    expect(res.statusText).toBe('Not Found')
    expect(req.payload.logger.error).toHaveBeenCalled()
  })

  it('maps a non-404 HTTPError to a 500 response', async () => {
    storageHandlerMock.mockRejectedValue(httpError(500))
    const handler = getStaticHandler(context({ streamOptions: undefined }))

    const res = await handler(makeReq(), { doc: undefined, params: { filename: 'photo.jpg' } })

    expect(res.status).toBe(500)
    expect(res.statusText).toBe('Internal Server Error')
  })

  it('maps a generic error to a 500 response', async () => {
    storageHandlerMock.mockRejectedValue(new Error('boom'))
    const req = makeReq()
    const handler = getStaticHandler(context({ streamOptions: undefined }))

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
  const storageOnly = (over: Partial<CollectionContext> = {}) =>
    getStaticHandler(context({ streamOptions: undefined, ...over }))

  it('uses the prefix and object key stored on the doc', async () => {
    const req = makeReq()

    await storageOnly()(req, {
      doc: { _objectKey: 'k1', filename: 'photo.jpg', prefix: 'media' },
      params: { filename: 'photo.jpg', prefix: 'query/pre' },
    })

    expect(storageHandlerMock).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'media/k1' }))
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('uses the location of the representation that matches the filename', async () => {
    const doc = {
      _objectKey: 'k1',
      filename: 'photo.jpg',
      original: { _objectKey: 'k2', filename: 'photo-original.jpg', prefix: 'media' },
      prefix: 'media',
    }

    await storageOnly()(makeReq(), { doc, params: { filename: 'photo-original.jpg' } })

    expect(storageHandlerMock).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'media/k2' }))
  })

  it('uses the doc prefix alone for a legacy doc without an original', async () => {
    await storageOnly()(makeReq(), {
      doc: { filename: 'photo.jpg', prefix: 'legacy' },
      params: { filename: 'photo.jpg' },
    })

    expect(storageHandlerMock).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'legacy' }))
  })

  it('reads back the prefix and object key of an upload reference', async () => {
    const req = makeReq()

    await storageOnly()(req, {
      doc: null,
      params: { filename: 'photo.jpg', uploadReference: { _objectKey: 'k3', prefix: 'tenants/acme' } },
    })

    expect(storageHandlerMock).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'tenants/acme/k3' }))
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('sanitizes a traversal attempt in an upload reference prefix', async () => {
    await storageOnly()(makeReq(), {
      doc: null,
      params: { filename: 'photo.jpg', uploadReference: { prefix: '../%2e%2e/secret' } },
    })

    const passedPrefix = storageHandlerMock.mock.calls[0][0].prefix as string
    expect(passedPrefix).not.toContain('..')
  })

  it('finds the doc by filename and the prefix query param when the collection has a prefix field', async () => {
    const req = makeReq({ docs: [{ _objectKey: 'k4', filename: 'photo.jpg', prefix: 'tenants/db/media' }] })

    await storageOnly({ collection: prefixCollection })(req, {
      doc: undefined,
      params: { filename: 'photo.jpg', prefix: 'tenants/db/media' },
    })

    expect(req.payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'media',
        draft: true,
        where: {
          and: [
            { or: expect.arrayContaining([{ filename: { equals: 'photo.jpg' } }]) },
            { prefix: { equals: 'tenants/db/media' } },
          ],
        },
      }),
    )
    expect(storageHandlerMock).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'tenants/db/media/k4' }))
  })

  it('passes an empty prefix next to the collection prefix when no doc matches', async () => {
    await storageOnly({ prefix: 'static-pre' })(makeReq(), { doc: undefined, params: { filename: 'photo.jpg' } })

    expect(storageHandlerMock).toHaveBeenCalledWith(
      expect.objectContaining({ collectionPrefix: 'static-pre', prefix: '' }),
    )
  })
})
