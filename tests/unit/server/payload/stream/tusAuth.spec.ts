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

vi.mock('@/server/payload/stream/tusSignature.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/payload/stream/tusSignature.js')>()),
  generateStreamTusUploadSignature: signMock,
}))

const { verifyClientUploadReceipt } = await import('payload/internal')
const { readClientUpload } = await import('@/server/payload/storage/clientUploads/receipt.js')
const { signStreamVideoToken } = await import('@/server/payload/stream/tusSignature.js')
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
      config: { upload: {} },
      collections: { media: { config: collection } },
      logger: { debug: vi.fn(), error: vi.fn() },
      secret: 'payload-secret',
    },
    t: (key: string) => key,
    ...overrides,
  }) as never

const tokenFor = (videoId: string, collectionSlug = 'media', libraryId = 12345, user: unknown = null) =>
  signStreamVideoToken({
    collection: collectionSlug,
    libraryId,
    secret: 'payload-secret',
    user: user as never,
    videoId,
  })

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
    const res = await handler(buildReq({ ...validBody, videoId: 'existing-1', videoToken: tokenFor('existing-1') }))
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
    const res = await handler(buildReq({ ...validBody, videoId: 'reuse-1', videoToken: tokenFor('reuse-1') }))
    const json = await res.json()

    expect(json.type).toBe('upload')
    expect(json.videoId).toBe('reuse-1')
    expect(createVideoMock).not.toHaveBeenCalled()
  })

  it('returns a video token bound to the collection and library', async () => {
    const handler = getTusHandler(buildConfig())
    const json = await (await handler(buildReq(validBody))).json()

    expect(json.videoToken).toBe(tokenFor('new-video-1'))
    expect(json.signedReceipt).toBeUndefined()
  })

  it('returns a video token with an already processed video', async () => {
    getVideoMock.mockResolvedValue({ status: 4, title: 'Existing Title' })
    isErrorMock.mockReturnValue(false)
    isProcessedMock.mockReturnValue(true)

    const handler = getTusHandler(buildConfig())
    const res = await handler(buildReq({ ...validBody, videoId: 'existing-1', videoToken: tokenFor('existing-1') }))
    const json = await res.json()

    expect(json.videoToken).toBe(tokenFor('existing-1'))
  })

  it.each([
    ['no token', undefined],
    ['a forged token', 'f'.repeat(64)],
    ['a token for another collection', tokenFor('reuse-1', 'other')],
    ['a token for another library', tokenFor('reuse-1', 'media', 999)],
    ['a token for another video', tokenFor('other-video')],
    ['a token for another user', tokenFor('reuse-1', 'media', 12345, { collection: 'users', id: 'user-2' })],
  ])('creates a new video when the videoId comes with %s', async (_label, videoToken) => {
    canUploadToVideoMock.mockReturnValue(true)

    const handler = getTusHandler(buildConfig())
    const res = await handler(buildReq({ ...validBody, videoId: 'reuse-1', videoToken }))
    const json = await res.json()

    expect(getVideoMock).not.toHaveBeenCalled()
    expect(createVideoMock).toHaveBeenCalled()
    expect(json.videoId).toBe('new-video-1')
    expect(json.videoToken).toBe(tokenFor('new-video-1'))
  })

  it('binds the video token to the signed-in user', async () => {
    const user = { collection: 'users', id: 'user-1' }
    const json = await (await getTusHandler(buildConfig())(buildReq(validBody, { user }))).json()

    expect(json.videoToken).toBe(tokenFor('new-video-1', 'media', 12345, user))
    expect(json.videoToken).not.toBe(tokenFor('new-video-1'))
  })

  it('creates a new video when the video token has expired', async () => {
    vi.useFakeTimers()
    try {
      const videoToken = tokenFor('reuse-1')
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000)
      const json = await (
        await getTusHandler(buildConfig())(buildReq({ ...validBody, videoId: 'reuse-1', videoToken }))
      ).json()

      expect(getVideoMock).not.toHaveBeenCalled()
      expect(json.videoId).toBe('new-video-1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns a signed upload reference bound to the video and head when the file head is sent', async () => {
    const handler = getTusHandler(buildConfig())
    const req = buildReq(
      { ...validBody, head: 'AAAA' },
      {
        payload: {
          config: { upload: {} },
          collections: { media: { config: collection } },
          db: { findOne: async () => null },
          logger: { debug: vi.fn(), error: vi.fn() },
          secret: 'payload-secret',
        },
        user: { collection: 'users', id: 'user-1' },
      },
    )
    const json = await (await handler(req)).json()

    expect(json.filename).toBe('clip.mp4')
    const receipt = verifyClientUploadReceipt({ collectionSlug: 'media', req, signedReceipt: json.signedReceipt })
    expect(receipt.filename).toBe('clip.mp4')
    expect(
      readClientUpload({
        collectionSlug: 'media',
        filename: 'clip.mp4',
        req,
        uploadReference: { signedReceipt: json.signedReceipt },
      }),
    ).toEqual({ filesize: 1000, head: 'AAAA', mimeType: 'video/mp4', prefix: '', videoId: 'new-video-1' })
  })

  it('signs the collection prefix, never the zone root', async () => {
    const config = createNormalizedConfig({
      collections: { media: { disablePayloadAccessControl: true, prefix: 'media' } },
      stream: {
        apiKey: 'stream-key',
        hostname: 'stream.b-cdn.net',
        libraryId: 12345,
        tus: { checkAccess: () => true },
      },
    } as never)
    const req = buildReq(
      { ...validBody, head: 'AAAA' },
      {
        payload: {
          config: { upload: {} },
          collections: { media: { config: collection } },
          db: { findOne: async () => null },
          logger: { debug: vi.fn(), error: vi.fn() },
          secret: 'payload-secret',
        },
      },
    )
    const json = await (await getTusHandler(config)(req)).json()

    expect(
      verifyClientUploadReceipt({ collectionSlug: 'media', req, signedReceipt: json.signedReceipt }).filePrefix,
    ).toBe('media')
  })

  it('binds the upload reference to a unique file name', async () => {
    const handler = getTusHandler(buildConfig())
    const taken = new Set(['clip.mp4'])
    const req = buildReq(
      { ...validBody, head: 'AAAA' },
      {
        payload: {
          config: { upload: {} },
          collections: { media: { config: collection } },
          db: {
            findOne: async ({ where }: { where: { filename: { equals: string } } }) =>
              taken.has(where.filename.equals) || null,
          },
          logger: { debug: vi.fn(), error: vi.fn() },
          secret: 'payload-secret',
        },
      },
    )
    const json = await (await handler(req)).json()

    expect(json.filename).toBe('clip-1.mp4')
    expect(
      verifyClientUploadReceipt({ collectionSlug: 'media', req, signedReceipt: json.signedReceipt }).filename,
    ).toBe('clip-1.mp4')
  })

  describe('file checks', () => {
    const buildCheckReq = (body: Record<string, unknown>, upload: Record<string, unknown>, fileSize?: number) =>
      buildReq(body, {
        payload: {
          collections: { media: { config: { slug: 'media', upload } } },
          config: { upload: fileSize === undefined ? {} : { limits: { fileSize } } },
          logger: { debug: vi.fn(), error: vi.fn() },
          secret: 'payload-secret',
        },
      })

    it.each([
      ['a type outside upload.mimeTypes', { filetype: 'video/webm' }, { mimeTypes: ['video/mp4'] }, 415],
      ['a type the stream config does not accept', { filename: 'a.png', filetype: 'image/png' }, {}, 415],
      ['a restricted file type', { filename: 'clip.html' }, { mimeTypes: ['video/mp4'] }, 415],
      ['an SVG file', { filename: 'a.svg', filetype: 'image/svg+xml' }, {}, 400],
      ['an invalid MIME type', { filetype: 'not a type' }, {}, 400],
      ['a fractional file size', { filesize: 1.5 }, {}, 400],
    ])('rejects %s before creating a video', async (_label, overrides, upload, status) => {
      const handler = getTusHandler(buildConfig())
      await expect(handler(buildCheckReq({ ...validBody, ...overrides }, upload))).rejects.toMatchObject({ status })
      expect(createVideoMock).not.toHaveBeenCalled()
    })

    it('rejects a file over upload.limits.fileSize', async () => {
      const handler = getTusHandler(buildConfig())
      await expect(handler(buildCheckReq(validBody, {}, 999))).rejects.toMatchObject({ status: 413 })
      expect(createVideoMock).not.toHaveBeenCalled()
    })

    it('checks the file before returning an already processed video', async () => {
      getVideoMock.mockResolvedValue({ status: 4, title: 'Existing Title' })
      isErrorMock.mockReturnValue(false)
      isProcessedMock.mockReturnValue(true)

      const handler = getTusHandler(buildConfig())
      const body = { ...validBody, filetype: 'text/html', videoId: 'existing-1', videoToken: tokenFor('existing-1') }
      await expect(handler(buildCheckReq(body, {}))).rejects.toMatchObject({ status: 415 })
      expect(getVideoMock).not.toHaveBeenCalled()
    })
  })

  it('rejects an oversized file head', async () => {
    const handler = getTusHandler(buildConfig())
    await expect(handler(buildReq({ ...validBody, head: 'A'.repeat(8193) }))).rejects.toMatchObject({ status: 400 })
    expect(createVideoMock).not.toHaveBeenCalled()
  })

  it('creates a fresh video when the existing one is in an error state', async () => {
    getVideoMock.mockResolvedValue({ status: 5, title: 'Broken' })
    isErrorMock.mockReturnValue(true)
    isProcessedMock.mockReturnValue(false)

    const handler = getTusHandler(buildConfig())
    const res = await handler(buildReq({ ...validBody, videoId: 'broken-1', videoToken: tokenFor('broken-1') }))
    const json = await res.json()

    expect(json.videoId).toBe('new-video-1')
    expect(createVideoMock).toHaveBeenCalled()
  })

  it('creates a fresh video when the lookup throws', async () => {
    getVideoMock.mockRejectedValue(new Error('not found'))

    const handler = getTusHandler(buildConfig())
    const res = await handler(buildReq({ ...validBody, videoId: 'missing-1', videoToken: tokenFor('missing-1') }))
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

    it('denies access without admin access even when create is granted', async () => {
      getAccessResultsMock.mockResolvedValue({
        canAccessAdmin: false,
        collections: { media: { create: true } },
      })

      const handler = getTusHandler(noCheckAccessConfig())
      await expect(handler(buildReq(validBody))).rejects.toMatchObject({ status: 403 })
      expect(createVideoMock).not.toHaveBeenCalled()
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
            config: { upload: {} },
            collections: { alpha: { config: alpha }, beta: { config: beta } },
            logger: { debug: vi.fn(), error: vi.fn() },
            secret: 'payload-secret',
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
          config: { upload: {} },
          collections: { alpha: { config: alpha }, beta: { config: beta } },
          logger: { debug: vi.fn(), error: vi.fn() },
          secret: 'payload-secret',
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
      await handler(buildMultiReq({ ...betaBody, videoId: 'reuse-b', videoToken: tokenFor('reuse-b', 'beta', 222) }))

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
