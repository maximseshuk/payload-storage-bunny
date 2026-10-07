import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { httpError } from '../../../../helpers/unit/httpError.js'

const { checkSizeMock, findByIDMock, getVideoMock, listVideosMock, readyResolutionsMock, writeMock } = vi.hoisted(
  () => ({
    checkSizeMock: vi.fn(),
    findByIDMock: vi.fn(),
    getVideoMock: vi.fn(),
    listVideosMock: vi.fn(),
    readyResolutionsMock: vi.fn(),
    writeMock: vi.fn(),
  }),
)

vi.mock('@/server/bunny/stream.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/bunny/stream.js')>()),
  getReadyResolutions: readyResolutionsMock,
  getStreamVideo: getVideoMock,
  listStreamVideos: listVideosMock,
}))

vi.mock('@/server/payload/stream/storedStream.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/payload/stream/storedStream.js')>()),
  checkStreamOriginalSize: checkSizeMock,
  writeStoredStream: writeMock,
}))

const { createNormalizedOptions } = await import('@/server/payload/options/normalizer.js')
const { getStreamEndpoints } = await import('@/server/payload/stream/endpoints.js')

const { createBaseStream } = await import('../../../../helpers/unit/optionsBuilders.js')
const { buildStreamReq } = await import('../../../../helpers/unit/stream.js')

const buildOptions = (webhook?: { secret: string }, status?: boolean, mp4Fallback?: boolean) =>
  createNormalizedOptions({
    collections: {
      docs: { stream: false },
      media: { disablePayloadAccessControl: true },
      plain: { stream: { status: false } },
    },
    stream: { ...createBaseStream(), mp4Fallback, status, webhook },
  } as never)

const getHandler = (options = buildOptions()) =>
  getStreamEndpoints(options).find(
    (endpoint) => endpoint.path === '/storage-bunny/stream/status/:collection/:id/:videoId',
  )!.handler as (req: never) => Promise<Response>

const buildReq = (routeParams: Record<string, unknown>, overrides: Record<string, unknown> = {}) =>
  buildStreamReq({
    collections: { docs: { upload: true }, media: { upload: true }, plain: { upload: true }, users: {} },
    payload: { config: { admin: { user: 'users' } }, db: { defaultIDType: 'number' }, findByID: findByIDMock },
    routeParams,
    user: { id: 1, collection: 'users' },
    ...overrides,
  })

const mediaReq = (videoId = 'video-1') => buildReq({ collection: 'media', id: '1', videoId })

const streamDoc = (stream: Record<string, unknown> = {}) => ({
  id: '1',
  bunnyData: { stream: { libraryId: 99999, videoId: 'video-1', ...stream }, type: 'stream' },
})

const readState = async (res: Promise<Response>) => (await res).json()

const expectWrite = (stream: Record<string, unknown>, whenStatus: null | string = 'processing') =>
  expect(writeMock).toHaveBeenCalledExactlyOnceWith({
    collection: 'media',
    id: '1',
    req: expect.anything(),
    stream: { videoId: 'video-1', ...stream },
    whenStatus,
  })

describe('stream status endpoint', () => {
  let handler: ReturnType<typeof getHandler>

  beforeEach(() => {
    vi.clearAllMocks()
    findByIDMock.mockResolvedValue(streamDoc({ status: 'processing' }))
    listVideosMock.mockResolvedValue({ items: [] })
    readyResolutionsMock.mockImplementation(async ({ resolutions }) => resolutions)
    writeMock.mockResolvedValue(true)
    handler = getHandler()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['a stored ready state', 'ready', undefined],
    ['a stored failed state', 'failed', undefined],
    ['a stored state with its resolutions', 'ready', { available: ['720p', '1080p'], highest: '1080p' }],
  ])('returns %s without calling Bunny', async (_label, status, resolutions) => {
    findByIDMock.mockResolvedValue(streamDoc({ resolutions, status }))

    expect(await readState(handler(mediaReq()))).toEqual({ resolutions, state: status })
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
    expect(getVideoMock).not.toHaveBeenCalled()
    expect(writeMock).not.toHaveBeenCalled()
  })

  it('asks Bunny with the configured library while the video is processing and writes nothing unchanged', async () => {
    getVideoMock.mockResolvedValue({ availableResolutions: null, guid: 'video-1', status: 3 })

    expect(await readState(handler(mediaReq()))).toEqual({ state: 'processing' })
    expect(getVideoMock).toHaveBeenCalledWith({ apiKey: 'stream-key', libraryId: 12345, videoId: 'video-1' })
    expect(writeMock).not.toHaveBeenCalled()
  })

  it('checks the size of the original file of a video that became ready', async () => {
    getVideoMock.mockResolvedValue({ availableResolutions: '720p', status: 4 })
    const doc = { ...streamDoc({ status: 'processing' }), filesize: 1000 }
    findByIDMock.mockResolvedValue(doc)

    expect(await readState(handler(mediaReq()))).toEqual({ state: 'ready' })
    expect(checkSizeMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ apiKey: 'stream-key', collection: 'media', doc, libraryId: 12345, videoId: 'video-1' }),
    )
  })

  it('stores a changed state only while the stored state is still the one it read', async () => {
    getVideoMock.mockResolvedValue({ availableResolutions: '720p', status: 4 })

    expect(await readState(handler(mediaReq()))).toEqual({ state: 'ready' })
    expectWrite({ status: 'ready' })
  })

  it('fills the resolutions in the same write when the video becomes ready and mp4Fallback is on', async () => {
    const resolutions = { available: ['720p'], highest: '720p' }
    readyResolutionsMock.mockResolvedValue(resolutions)
    getVideoMock.mockResolvedValue({ availableResolutions: '720p', status: 4 })

    expect(await readState(getHandler(buildOptions(undefined, undefined, true))(mediaReq()))).toEqual({
      resolutions,
      state: 'ready',
    })
    expect(readyResolutionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'stream-key', encoded: true, libraryId: 12345, mp4Fallback: true }),
    )
    expectWrite({ resolutions, status: 'ready' })
  })

  it('keeps the video processing and writes nothing when the resolutions request is rate limited', async () => {
    readyResolutionsMock.mockRejectedValue(new Error('HTTP 429', { cause: httpError(429) }))
    getVideoMock.mockResolvedValue({ availableResolutions: '720p', status: 4 })

    expect(await readState(getHandler(buildOptions(undefined, undefined, true))(mediaReq()))).toEqual({
      state: 'processing',
    })
    expect(writeMock).not.toHaveBeenCalled()
  })

  it('keeps an encoded video processing until Bunny returns its MP4 resolutions', async () => {
    getVideoMock.mockResolvedValue({ availableResolutions: '720p', status: 4 })
    const mp4Handler = getHandler(buildOptions(undefined, undefined, true))

    expect(await readState(mp4Handler(mediaReq()))).toEqual({ state: 'processing' })
    expect(writeMock).not.toHaveBeenCalled()

    findByIDMock.mockResolvedValue(streamDoc({ videoId: 'video-2' }))
    expect(await readState(mp4Handler(mediaReq('video-2')))).toEqual({ state: 'processing' })
    expectWrite({ status: 'processing', videoId: 'video-2' }, null)
  })

  it('asks Bunny for an old document without a stored state and keeps its resolutions', async () => {
    const resolutions = { available: ['720p'], highest: '720p' }
    findByIDMock.mockResolvedValue(streamDoc({ resolutions }))
    getVideoMock.mockResolvedValue({ availableResolutions: '720p', status: 4 })

    expect(await readState(handler(mediaReq()))).toEqual({ resolutions, state: 'ready' })
    expectWrite({ resolutions, status: 'ready' }, null)
  })

  it('maps a video that Bunny no longer has to failed when the library still answers', async () => {
    getVideoMock.mockRejectedValue(new Error('Bunny Stream: Video not found: video-1', { cause: httpError(404) }))

    expect(await readState(handler(mediaReq()))).toEqual({ state: 'failed' })
    expect(listVideosMock).toHaveBeenCalledWith({ apiKey: 'stream-key', itemsPerPage: 1, libraryId: 12345 })
    expectWrite({ status: 'failed' })
  })

  it('does not mark the video failed when the library itself does not answer', async () => {
    getVideoMock.mockRejectedValue(new Error('Bunny Stream: Video not found: video-1', { cause: httpError(404) }))
    listVideosMock.mockRejectedValue(new Error('Bunny Stream: Library not found', { cause: httpError(404) }))

    await expect(handler(mediaReq())).rejects.toMatchObject({ status: 500 })
    expect(writeMock).not.toHaveBeenCalled()
  })

  it.each([
    ['without a webhook', undefined, 10_000],
    ['with a webhook', { secret: 'hook-secret' }, 60_000],
  ])(
    'serves a cached state for the TTL of a library %s and asks Bunny again after it',
    async (_label, webhook, ttl) => {
      vi.useFakeTimers()
      handler = getHandler(buildOptions(webhook))
      getVideoMock.mockResolvedValue({ availableResolutions: null, status: 3 })

      await handler(mediaReq())
      vi.advanceTimersByTime(ttl - 1_000)
      await handler(mediaReq())
      expect(getVideoMock).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(1_000)
      await handler(mediaReq())
      expect(getVideoMock).toHaveBeenCalledTimes(2)
    },
  )

  it('makes one Bunny call for concurrent requests', async () => {
    let resolveVideo: (video: unknown) => void = () => {}
    getVideoMock.mockReturnValue(
      new Promise((resolve) => {
        resolveVideo = resolve
      }),
    )

    const pending = Array.from({ length: 5 }, () => handler(mediaReq()))
    await vi.waitFor(() => expect(getVideoMock).toHaveBeenCalled())
    resolveVideo({ availableResolutions: '720p', status: 4 })

    const states = await Promise.all(pending.map(readState))
    expect(states).toEqual(Array.from({ length: 5 }, () => ({ state: 'ready' })))
    expect(getVideoMock).toHaveBeenCalledTimes(1)
    expect(writeMock).toHaveBeenCalledTimes(1)
  })

  it('hides Bunny errors behind a 500 and does not cache them', async () => {
    getVideoMock.mockRejectedValueOnce(new Error('Bunny Stream: Invalid API key', { cause: httpError(401) }))
    const req = mediaReq()

    await expect(handler(req)).rejects.toMatchObject({ message: 'error:unknown', status: 500 })
    expect((req as { payload: { logger: { error: unknown } } }).payload.logger.error).toHaveBeenCalled()

    getVideoMock.mockResolvedValue({ availableResolutions: null, status: 3 })
    expect(await readState(handler(mediaReq()))).toEqual({ state: 'processing' })
    expect(getVideoMock).toHaveBeenCalledTimes(2)
  })

  it('throws 401 without a signed-in user', async () => {
    await expect(
      handler(buildReq({ collection: 'media', id: '1', videoId: 'video-1' }, { user: null })),
    ).rejects.toMatchObject({
      status: 401,
    })
    expect(findByIDMock).not.toHaveBeenCalled()
  })

  it('throws 403 for a user who cannot open the admin panel, before any Bunny or database call', async () => {
    const customer = buildReq(
      { collection: 'media', id: '1', videoId: 'video-1' },
      { user: { id: 2, collection: 'customers' } },
    )
    await expect(handler(customer)).rejects.toMatchObject({ status: 403 })

    const rejected = buildReq({ collection: 'media', id: '1', videoId: 'video-1' })
    ;(rejected as any).payload.collections.users.config.access = { admin: () => false }
    await expect(handler(rejected)).rejects.toMatchObject({ status: 403 })

    expect(findByIDMock).not.toHaveBeenCalled()
    expect(getVideoMock).not.toHaveBeenCalled()
  })

  it('throws 404 when the collection does not store the status', async () => {
    await expect(handler(buildReq({ collection: 'plain', id: '1', videoId: 'video-1' }))).rejects.toMatchObject({
      status: 404,
    })
    expect(findByIDMock).not.toHaveBeenCalled()
    expect(getVideoMock).not.toHaveBeenCalled()
  })

  it('is not registered when no collection stores the status', () => {
    const paths = getStreamEndpoints(buildOptions(undefined, false)).map((endpoint) => endpoint.path)
    expect(paths).not.toContain('/storage-bunny/stream/status/:collection/:id/:videoId')
  })

  it('checks the id against the custom id type of the collection', async () => {
    const req = buildReq({ collection: 'media', id: 'abc', videoId: 'video-1' })
    ;(req as any).payload.collections.media.customIDType = 'text'

    expect(await readState(handler(req))).toEqual({ state: 'processing' })
    expect(findByIDMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'abc' }))
  })

  it('throws 500 and logs when the database fails', async () => {
    findByIDMock.mockRejectedValue(new Error('connection refused'))
    const req = mediaReq()

    await expect(handler(req)).rejects.toMatchObject({ status: 500 })
    expect((req as any).payload.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ msg: '[bunny:stream] status: request failed' }),
    )
    expect(getVideoMock).not.toHaveBeenCalled()
  })
})
