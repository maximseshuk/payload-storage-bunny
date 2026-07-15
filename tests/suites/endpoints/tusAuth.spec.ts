import { APIError } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  canUploadToVideoMock,
  createSessionMock,
  createVideoMock,
  getAccessResultsMock,
  getVideoMock,
  isErrorMock,
  isProcessedMock,
  signMock,
} = vi.hoisted(() => ({
  canUploadToVideoMock: vi.fn(),
  createSessionMock: vi.fn(),
  createVideoMock: vi.fn(),
  getAccessResultsMock: vi.fn(),
  getVideoMock: vi.fn(),
  isErrorMock: vi.fn(),
  isProcessedMock: vi.fn(),
  signMock: vi.fn(),
}))

vi.mock('payload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('payload')>()
  return { ...actual, getAccessResults: getAccessResultsMock }
})

vi.mock('@/stream/api.js', () => ({
  canUploadToVideo: canUploadToVideoMock,
  createStreamVideo: createVideoMock,
  getStreamVideo: getVideoMock,
  getStreamVideoResolutions: vi.fn(),
  isVideoInErrorState: isErrorMock,
  isVideoProcessed: isProcessedMock,
  parseMp4Resolutions: vi.fn(),
}))

vi.mock('@/stream/sessionsCollection.js', () => ({
  createStreamVideoSession: createSessionMock,
}))

vi.mock('@/stream/tusSignature.js', () => ({
  generateStreamTusUploadSignature: signMock,
}))

const { createNormalizedConfig } = await import('@/config/normalizer.js')
const { getStreamEndpoints } = await import('@/stream/endpoints.js')

const collection = { slug: 'media', upload: { mimeTypes: ['video/mp4'] } }

const buildConfig = (streamOverrides: Record<string, unknown> = {}, cleanup = false) =>
  createNormalizedConfig({
    collections: { media: { disablePayloadAccessControl: true } },
    stream: {
      apiKey: 'stream-key',
      cleanup,
      hostname: 'stream.b-cdn.net',
      libraryId: 12345,
      tus: { checkAccess: () => true },
      ...streamOverrides,
    },
  } as never)

const buildReq = (body: Record<string, unknown>, overrides: Record<string, unknown> = {}) =>
  ({
    json: async () => body,
    payload: {
      collections: { media: { config: collection } },
      logger: { debug: vi.fn(), error: vi.fn() },
    },
    t: (key: string) => key,
    ...overrides,
  }) as never

const getTusHandler = (config: ReturnType<typeof buildConfig>) => {
  const endpoint = getStreamEndpoints(config).find((e) => e.path === '/storage-bunny/stream/tus-auth')
  return endpoint!.handler as (req: never) => Promise<Response>
}

const validBody = {
  collection: 'media',
  filename: 'clip.mp4',
  filesize: 1000,
  filetype: 'video/mp4',
  title: 'My Clip',
}

describe('TUS auth endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signMock.mockReturnValue('signature-abc')
    createVideoMock.mockResolvedValue({ guid: 'new-video-1', videoLibraryId: 12345 })
  })

  it('creates a new video and returns a signed upload payload (happy path)', async () => {
    const handler = getTusHandler(buildConfig())
    const res = await handler(buildReq(validBody))
    const json = await res.json()

    expect(json.type).toBe('upload')
    expect(json.videoId).toBe('new-video-1')
    expect(json.libraryId).toBe(12345)
    expect(json.authorizationSignature).toBe('signature-abc')
    expect(typeof json.authorizationExpire).toBe('number')
    expect(createVideoMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'My Clip' }))
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('registers a cleanup session when cleanup is enabled', async () => {
    const handler = getTusHandler(buildConfig({}, true))
    await handler(buildReq(validBody))

    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ libraryId: 12345, videoId: 'new-video-1' }),
    )
  })

  it('throws 400 when required fields are missing', async () => {
    const handler = getTusHandler(buildConfig())
    await expect(handler(buildReq({ collection: 'media', filename: 'clip.mp4' }))).rejects.toMatchObject({
      status: 400,
    })
  })

  it('throws 403 when access is denied', async () => {
    const handler = getTusHandler(buildConfig({ tus: { checkAccess: () => false } }))
    await expect(handler(buildReq(validBody))).rejects.toMatchObject({ status: 403 })
  })

  it('throws 500 when the stream config is missing credentials', async () => {
    const config = buildConfig()
    config.stream!.apiKey = ''
    const handler = getTusHandler(config)
    await expect(handler(buildReq(validBody))).rejects.toMatchObject({ status: 500 })
  })

  it('throws 400 when the resolved title is empty', async () => {
    const handler = getTusHandler(buildConfig())
    await expect(handler(buildReq({ ...validBody, filename: '   ', title: '' }))).rejects.toMatchObject({ status: 400 })
  })

  it('short-circuits to type "uploaded" when the video is already processed', async () => {
    getVideoMock.mockResolvedValue({ status: 4, title: 'Existing Title' })
    isErrorMock.mockReturnValue(false)
    isProcessedMock.mockReturnValue(true)

    const handler = getTusHandler(buildConfig())
    const res = await handler(buildReq({ ...validBody, videoId: 'existing-1' }))
    const json = await res.json()

    expect(json.type).toBe('uploaded')
    expect(json.videoId).toBe('existing-1')
    expect(json.title).toBe('Existing Title')
    expect(createVideoMock).not.toHaveBeenCalled()
  })

  it('reuses an existing uploadable video without creating a new one', async () => {
    getVideoMock.mockResolvedValue({ status: 0, title: 'Draft' })
    isErrorMock.mockReturnValue(false)
    isProcessedMock.mockReturnValue(false)
    canUploadToVideoMock.mockReturnValue(true)

    const handler = getTusHandler(buildConfig())
    const res = await handler(buildReq({ ...validBody, videoId: 'reuse-1' }))
    const json = await res.json()

    expect(json.type).toBe('upload')
    expect(json.videoId).toBe('reuse-1')
    expect(createVideoMock).not.toHaveBeenCalled()
  })

  it('creates a fresh video when the existing one is in an error state', async () => {
    getVideoMock.mockResolvedValue({ status: 5, title: 'Broken' })
    isErrorMock.mockReturnValue(true)
    isProcessedMock.mockReturnValue(false)

    const handler = getTusHandler(buildConfig())
    const res = await handler(buildReq({ ...validBody, videoId: 'broken-1' }))
    const json = await res.json()

    expect(json.videoId).toBe('new-video-1')
    expect(createVideoMock).toHaveBeenCalled()
  })

  it('creates a fresh video when the lookup throws', async () => {
    getVideoMock.mockRejectedValue(new Error('not found'))

    const handler = getTusHandler(buildConfig())
    const res = await handler(buildReq({ ...validBody, videoId: 'missing-1' }))
    const json = await res.json()

    expect(json.videoId).toBe('new-video-1')
    expect(createVideoMock).toHaveBeenCalled()
  })

  it('wraps an unexpected error as a 500', async () => {
    createVideoMock.mockRejectedValue(new Error('boom'))
    const req = buildReq(validBody)
    const handler = getTusHandler(buildConfig())

    await expect(handler(req)).rejects.toMatchObject({ status: 500 })
    expect(
      (req as unknown as { payload: { logger: { error: ReturnType<typeof vi.fn> } } }).payload.logger.error,
    ).toHaveBeenCalled()
  })

  describe('default access control (getAccessResults)', () => {
    const noCheckAccessConfig = () => buildConfig({ tus: true })

    it('grants access when admin has create on a configured collection', async () => {
      getAccessResultsMock.mockResolvedValue({
        canAccessAdmin: true,
        collections: { media: { create: true } },
      })

      const handler = getTusHandler(noCheckAccessConfig())
      const res = await handler(buildReq(validBody))
      const json = await res.json()

      expect(json.type).toBe('upload')
    })

    it('denies access when admin lacks create on every collection', async () => {
      getAccessResultsMock.mockResolvedValue({
        canAccessAdmin: false,
        collections: { media: { create: false } },
      })

      const handler = getTusHandler(noCheckAccessConfig())
      await expect(handler(buildReq(validBody))).rejects.toBeInstanceOf(APIError)
    })
  })
})
