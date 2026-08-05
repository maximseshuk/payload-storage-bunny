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

vi.mock('@/server/bunny/stream.js', () => ({
  canUploadToVideo: canUploadToVideoMock,
  createStreamVideo: createVideoMock,
  getStreamVideo: getVideoMock,
  getStreamVideoResolutions: vi.fn(),
  isVideoInErrorState: isErrorMock,
  isVideoProcessed: isProcessedMock,
  parseMp4Resolutions: vi.fn(),
}))

vi.mock('@/server/payload/stream/sessionsCollection.js', () => ({
  createStreamVideoSession: createSessionMock,
}))

vi.mock('@/server/payload/stream/tusSignature.js', () => ({
  generateStreamTusUploadSignature: signMock,
}))

const { createNormalizedConfig } = await import('@/server/payload/config/normalizer.js')
const { getStreamEndpoints } = await import('@/server/payload/stream/endpoints.js')

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

  it('throws 400 when the requested collection has no stream tus config', async () => {
    const config = createNormalizedConfig({
      collections: { media: { disablePayloadAccessControl: true, stream: { tus: false } } },
      stream: {
        apiKey: 'stream-key',
        hostname: 'stream.b-cdn.net',
        libraryId: 12345,
        tus: { checkAccess: () => true },
      },
    } as never)
    const handler = getTusHandler(config)
    await expect(handler(buildReq(validBody))).rejects.toMatchObject({ status: 400 })
  })

  it('throws 404 when the requested collection is unknown', async () => {
    const handler = getTusHandler(buildConfig())
    await expect(handler(buildReq({ ...validBody, collection: 'ghost' }))).rejects.toMatchObject({ status: 404 })
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

    describe('is scoped to the requested collection', () => {
      const alpha = { slug: 'alpha', upload: { mimeTypes: ['video/mp4'] } }
      const beta = { slug: 'beta', upload: { mimeTypes: ['video/mp4'] } }

      const buildScopedConfig = () =>
        createNormalizedConfig({
          collections: {
            alpha: {
              disablePayloadAccessControl: true,
              stream: { apiKey: 'alpha-key', hostname: 'alpha.b-cdn.net', libraryId: 111, tus: true },
            },
            beta: {
              disablePayloadAccessControl: true,
              stream: { apiKey: 'beta-key', hostname: 'beta.b-cdn.net', libraryId: 222, tus: true },
            },
          },
        } as never)

      const buildScopedReq = (body: Record<string, unknown>) =>
        ({
          json: async () => body,
          payload: {
            collections: { alpha: { config: alpha }, beta: { config: beta } },
            logger: { debug: vi.fn(), error: vi.fn() },
          },
          t: (key: string) => key,
        }) as never

      const alphaBody = { collection: 'alpha', filename: 'a.mp4', filesize: 10, filetype: 'video/mp4', title: 'A' }
      const betaBody = { collection: 'beta', filename: 'b.mp4', filesize: 10, filetype: 'video/mp4', title: 'B' }

      it('allows the collection the user has create on (alpha)', async () => {
        getAccessResultsMock.mockResolvedValue({
          canAccessAdmin: true,
          collections: { alpha: { create: true }, beta: { create: false } },
        })
        createVideoMock.mockResolvedValue({ guid: 'v-alpha', videoLibraryId: 111 })

        const handler = getTusHandler(buildScopedConfig())
        const res = await handler(buildScopedReq(alphaBody))
        const json = await res.json()

        expect(json.type).toBe('upload')
        expect(json.libraryId).toBe(111)
      })

      it('denies a different collection the user lacks create on (beta)', async () => {
        getAccessResultsMock.mockResolvedValue({
          canAccessAdmin: true,
          collections: { alpha: { create: true }, beta: { create: false } },
        })

        const handler = getTusHandler(buildScopedConfig())
        await expect(handler(buildScopedReq(betaBody))).rejects.toMatchObject({ status: 403 })
        expect(createVideoMock).not.toHaveBeenCalled()
      })
    })
  })

  describe('per-collection stream libraries', () => {
    const alpha = { slug: 'alpha', upload: { mimeTypes: ['video/mp4'] } }
    const beta = { slug: 'beta', upload: { mimeTypes: ['video/mp4'] } }

    const buildMultiConfig = () =>
      createNormalizedConfig({
        collections: {
          alpha: {
            disablePayloadAccessControl: true,
            stream: {
              apiKey: 'alpha-key',
              cleanup: true,
              hostname: 'alpha.b-cdn.net',
              libraryId: 111,
              tus: { checkAccess: () => true },
            },
          },
          beta: {
            disablePayloadAccessControl: true,
            stream: {
              apiKey: 'beta-key',
              hostname: 'beta.b-cdn.net',
              libraryId: 222,
              tus: { checkAccess: () => true },
            },
          },
        },
        stream: {
          apiKey: 'stream-key',
          hostname: 'stream.b-cdn.net',
          libraryId: 12345,
          tus: { checkAccess: () => true },
        },
      } as never)

    const buildMultiReq = (body: Record<string, unknown>) =>
      ({
        json: async () => body,
        payload: {
          collections: { alpha: { config: alpha }, beta: { config: beta } },
          logger: { debug: vi.fn(), error: vi.fn() },
        },
        t: (key: string) => key,
      }) as never

    const alphaBody = { collection: 'alpha', filename: 'a.mp4', filesize: 10, filetype: 'video/mp4', title: 'A' }
    const betaBody = { collection: 'beta', filename: 'b.mp4', filesize: 10, filetype: 'video/mp4', title: 'B' }

    it('mints the signature and response for the requested collection library', async () => {
      createVideoMock.mockResolvedValue({ guid: 'v-alpha', videoLibraryId: 111 })
      const handler = getTusHandler(buildMultiConfig())
      const res = await handler(buildMultiReq(alphaBody))
      const json = await res.json()

      expect(json.libraryId).toBe(111)
      expect(signMock).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'alpha-key', libraryId: 111 }))
      expect(createVideoMock).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'alpha-key', libraryId: 111 }))
    })

    it('uses the other collection credentials for its request', async () => {
      createVideoMock.mockResolvedValue({ guid: 'v-beta', videoLibraryId: 222 })
      const handler = getTusHandler(buildMultiConfig())
      const res = await handler(buildMultiReq(betaBody))
      const json = await res.json()

      expect(json.libraryId).toBe(222)
      expect(signMock).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'beta-key', libraryId: 222 }))
    })

    it('calls getStreamVideo with the collection credentials when reusing a video', async () => {
      getVideoMock.mockResolvedValue({ status: 0, title: 'Draft' })
      isErrorMock.mockReturnValue(false)
      isProcessedMock.mockReturnValue(false)
      canUploadToVideoMock.mockReturnValue(true)

      const handler = getTusHandler(buildMultiConfig())
      await handler(buildMultiReq({ ...betaBody, videoId: 'reuse-b' }))

      expect(getVideoMock).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'beta-key', libraryId: 222, videoId: 'reuse-b' }),
      )
    })

    it('creates a session only for a collection with cleanup enabled', async () => {
      createVideoMock.mockResolvedValue({ guid: 'v-alpha', videoLibraryId: 111 })
      const handler = getTusHandler(buildMultiConfig())
      await handler(buildMultiReq(alphaBody))
      expect(createSessionMock).toHaveBeenCalledWith(expect.objectContaining({ libraryId: 111, videoId: 'v-alpha' }))

      createSessionMock.mockClear()
      createVideoMock.mockResolvedValue({ guid: 'v-beta', videoLibraryId: 222 })
      await handler(buildMultiReq(betaBody))
      expect(createSessionMock).not.toHaveBeenCalled()
    })

    it('invokes only the requested collection checkAccess', async () => {
      const alphaAccess = vi.fn().mockResolvedValue(true)
      const betaAccess = vi.fn().mockResolvedValue(true)
      createVideoMock.mockResolvedValue({ guid: 'v-alpha', videoLibraryId: 111 })

      const config = createNormalizedConfig({
        collections: {
          alpha: {
            disablePayloadAccessControl: true,
            stream: {
              apiKey: 'alpha-key',
              hostname: 'alpha.b-cdn.net',
              libraryId: 111,
              tus: { checkAccess: alphaAccess },
            },
          },
          beta: {
            disablePayloadAccessControl: true,
            stream: {
              apiKey: 'beta-key',
              hostname: 'beta.b-cdn.net',
              libraryId: 222,
              tus: { checkAccess: betaAccess },
            },
          },
        },
      } as never)

      const handler = getTusHandler(config)
      await handler(buildMultiReq(alphaBody))
      expect(alphaAccess).toHaveBeenCalled()
      expect(betaAccess).not.toHaveBeenCalled()
    })

    it('a merge-branch collection inherits the global checkAccess', async () => {
      const globalAccess = vi.fn().mockResolvedValue(true)
      createVideoMock.mockResolvedValue({ guid: 'v-media', videoLibraryId: 12345 })

      const config = createNormalizedConfig({
        collections: { media: { disablePayloadAccessControl: true } },
        stream: {
          apiKey: 'stream-key',
          hostname: 'stream.b-cdn.net',
          libraryId: 12345,
          tus: { checkAccess: globalAccess },
        },
      } as never)

      const handler = getTusHandler(config)
      await handler(buildReq(validBody))
      expect(globalAccess).toHaveBeenCalled()
    })

    it('registers the tus-auth endpoint when only a collection has tus', () => {
      const config = createNormalizedConfig({
        collections: {
          videos: {
            disablePayloadAccessControl: true,
            stream: { apiKey: 'v-key', hostname: 'v.b-cdn.net', libraryId: 900, tus: true },
          },
        },
      } as never)

      const endpoint = getStreamEndpoints(config).find((e) => e.path === '/storage-bunny/stream/tus-auth')
      expect(endpoint).toBeDefined()
    })
  })
})
