import { Forbidden, NotFound } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchMock, findByIDMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  findByIDMock: vi.fn(),
}))

vi.mock('@/server/http/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/http/index.js')>()),
  httpFetch: fetchMock,
}))

const { createNormalizedOptions } = await import('@/server/payload/options/normalizer.js')
const { getStreamEndpoints } = await import('@/server/payload/stream/endpoints.js')

const { createBaseStream } = await import('../../../../helpers/unit/optionsBuilders.js')
const { buildStreamReq } = await import('../../../../helpers/unit/stream.js')

const PATH = '/storage-bunny/stream/thumbnail/:collection/:id/:videoId/:file'

const buildOptions = (collections: Record<string, unknown>) =>
  createNormalizedOptions({
    collections,
    stream: createBaseStream(),
    thumbnail: true,
  } as never)

const defaultCollections = {
  docs: { stream: false },
  media: true,
  open: { disablePayloadAccessControl: true },
  plain: { thumbnail: false },
}

const getHandler = (collections: Record<string, unknown> = defaultCollections) =>
  getStreamEndpoints(buildOptions(collections)).find((endpoint) => endpoint.path === PATH)?.handler as
    | ((req: never) => Promise<Response>)
    | undefined

const buildReq = (routeParams: Record<string, unknown>) =>
  buildStreamReq({
    collections: {
      docs: { upload: true },
      media: { upload: true },
      open: { upload: true },
      plain: { upload: true },
      users: {},
    },
    headers: new Headers({ host: 'app.local' }),
    payload: { db: { defaultIDType: 'number' }, findByID: findByIDMock },
    routeParams,
    url: `http://app.local/api/storage-bunny/stream/thumbnail/${String(routeParams.collection)}/1/video-1/${String(routeParams.file)}?width=300`,
  })

const mediaReq = (file = 'thumbnail.jpg', videoId = 'video-1') =>
  buildReq({ collection: 'media', file, id: '1', videoId })

const streamDoc = (videoId: string) => ({ id: 1, bunnyData: { stream: { videoId }, type: 'stream' } })

describe('stream thumbnail endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findByIDMock.mockResolvedValue(streamDoc('video-1'))
    fetchMock.mockResolvedValue({
      body: 'image-bytes',
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      ok: true,
      status: 200,
    })
  })

  it.each(['thumbnail.jpg', 'preview.webp'])('serves %s from the Stream CDN with the query string', async (file) => {
    const res = await getHandler()!(mediaReq(file))

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('image-bytes')
    expect(fetchMock.mock.calls[0][0]).toBe(`https://stream.bunny.net/video-1/${file}?width=300`)
    expect(findByIDMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: '1',
        collection: 'media',
        draft: false,
        overrideAccess: false,
        select: { bunnyData: true, filesize: true, mimeType: true },
        trash: true,
      }),
    )
  })

  it('serves an anonymous caller when the collection read access allows it', async () => {
    const res = await getHandler()!(mediaReq())

    expect(res.status).toBe(200)
  })

  it.each([
    ['a 403', new Forbidden()],
    ['a 404', new NotFound()],
  ])('passes on %s from Payload read access without fetching', async (_label, error) => {
    findByIDMock.mockRejectedValue(error)

    await expect(getHandler()!(mediaReq())).rejects.toBe(error)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['an unknown file', { collection: 'media', file: 'video.mp4', id: '1', videoId: 'video-1' }],
    ['an unmanaged collection', { collection: 'users', file: 'thumbnail.jpg', id: '1', videoId: 'video-1' }],
    ['a collection without Stream', { collection: 'docs', file: 'thumbnail.jpg', id: '1', videoId: 'video-1' }],
    ['a collection without thumbnails', { collection: 'plain', file: 'thumbnail.jpg', id: '1', videoId: 'video-1' }],
    [
      'a collection without Payload access control',
      { collection: 'open', file: 'thumbnail.jpg', id: '1', videoId: 'video-1' },
    ],
    ['an invalid ID', { collection: 'media', file: 'thumbnail.jpg', id: 'abc', videoId: 'video-1' }],
    ['a missing video ID', { collection: 'media', file: 'thumbnail.jpg', id: '1' }],
  ])('returns 404 for %s', async (_label, params) => {
    await expect(getHandler()!(buildReq(params))).rejects.toBeInstanceOf(NotFound)
    expect(findByIDMock).not.toHaveBeenCalled()
  })

  it('returns 404 for a document without a Stream video', async () => {
    findByIDMock.mockResolvedValue({ id: 1, filename: 'photo.png' })

    await expect(getHandler()!(mediaReq())).rejects.toBeInstanceOf(NotFound)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 404 when the document keeps the video ID but has a non-Stream file', async () => {
    findByIDMock.mockResolvedValue({ ...streamDoc('video-1'), mimeType: 'image/png' })

    await expect(getHandler()!(mediaReq())).rejects.toBeInstanceOf(NotFound)
    expect(findByIDMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('serves the video of the latest draft the caller can read', async () => {
    findByIDMock.mockImplementation(async ({ draft }) => streamDoc(draft ? 'video-2' : 'video-1'))

    const res = await getHandler()!(mediaReq('thumbnail.jpg', 'video-2'))

    expect(res.status).toBe(200)
    expect(findByIDMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ draft: true, overrideAccess: false, trash: true }),
    )
    expect(fetchMock.mock.calls[0][0]).toBe('https://stream.bunny.net/video-2/thumbnail.jpg?width=300')
  })

  it('returns 404 for a video ID that is neither on the document nor on its latest draft', async () => {
    await expect(getHandler()!(mediaReq('thumbnail.jpg', 'video-other'))).rejects.toBeInstanceOf(NotFound)
    expect(findByIDMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('passes on the access error of the draft read without fetching', async () => {
    const error = new Forbidden()
    findByIDMock.mockImplementation(async ({ draft }) => {
      if (draft) {
        throw error
      }
      return streamDoc('video-1')
    })

    await expect(getHandler()!(mediaReq('thumbnail.jpg', 'video-2'))).rejects.toBe(error)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is not registered when no collection serves Stream thumbnails through Payload', () => {
    expect(getHandler({ open: { disablePayloadAccessControl: true } })).toBeUndefined()
  })
})
