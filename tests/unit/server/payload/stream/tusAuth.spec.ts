import { beforeEach, describe, expect, it, vi } from 'vitest'

import { httpError } from '../../../../helpers/unit/httpError.js'
import { createBaseStream } from '../../../../helpers/unit/optionsBuilders.js'
import { buildStreamReq, multiLibraryOptions } from '../../../../helpers/unit/stream.js'

const {
  createSessionMock,
  createUploadMock,
  createVideoMock,
  deleteVideoMock,
  findOneMock,
  getAccessResultsMock,
  getOffsetMock,
  getVideoMock,
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  createUploadMock: vi.fn(),
  createVideoMock: vi.fn(),
  deleteVideoMock: vi.fn(),
  findOneMock: vi.fn(),
  getAccessResultsMock: vi.fn(),
  getOffsetMock: vi.fn(),
  getVideoMock: vi.fn(),
}))

vi.mock('payload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('payload')>()
  return { ...actual, getAccessResults: getAccessResultsMock }
})

vi.mock('@/server/bunny/stream.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/bunny/stream.js')>()),
  createStreamTusUpload: createUploadMock,
  createStreamVideo: createVideoMock,
  deleteStreamVideo: deleteVideoMock,
  getStreamTusUploadOffset: getOffsetMock,
  getStreamVideo: getVideoMock,
}))

vi.mock('@/server/payload/stream/sessionsCollection.js', () => ({
  createStreamVideoSession: createSessionMock,
}))

const { signStreamVideoToken } = await import('@/server/payload/stream/tusSignature.js')
const { createNormalizedOptions } = await import('@/server/payload/options/normalizer.js')
const { getStreamEndpoints } = await import('@/server/payload/stream/endpoints.js')

const UPLOAD_URL = 'https://video.bunnycdn.com/tusupload/upload-1'

const tusVideo = (status: number, length = 1000, title = 'Draft') => ({
  guid: 'video',
  metaTags: [
    { property: 'payload-storage-bunny:upload-url', value: UPLOAD_URL },
    { property: 'payload-storage-bunny:upload-length', value: String(length) },
  ],
  status,
  title,
})

const notFound = () => new Error('HTTP 404', { cause: httpError(404) })

const buildOptions = (streamOverrides: Record<string, unknown> = {}) =>
  createNormalizedOptions({
    collections: { media: { disablePayloadAccessControl: true } },
    stream: { ...createBaseStream(), tus: { access: () => true }, ...streamOverrides },
  } as never)

const buildReq = (
  body: Record<string, unknown>,
  {
    collections,
    ...overrides
  }: { collections?: Record<string, Record<string, unknown>> } & Record<string, unknown> = {},
) =>
  buildStreamReq({
    collections,
    json: async () => body,
    payload: { config: { upload: {} }, db: { findOne: findOneMock } },
    ...overrides,
  })

const multiCollections = {
  alpha: { upload: { mimeTypes: ['video/mp4'] } },
  beta: { upload: { mimeTypes: ['video/mp4'] } },
}

const alphaBody = { collection: 'alpha', filename: 'a.mp4', filesize: 10, filetype: 'video/mp4', title: 'A' }
const betaBody = { collection: 'beta', filename: 'b.mp4', filesize: 10, filetype: 'video/mp4', title: 'B' }

const buildMultiReq = (body: Record<string, unknown>) => buildReq(body, { collections: multiCollections })

const tokenFor = (videoId: string, collectionSlug = 'media', libraryId = 12345, user: unknown = null) =>
  signStreamVideoToken({
    collection: collectionSlug,
    libraryId,
    secret: 'payload-secret',
    user: user as never,
    videoId,
  })

const getTusHandler = (options: ReturnType<typeof buildOptions>) => {
  const endpoint = getStreamEndpoints(options).find((e) => e.path === '/storage-bunny/stream/tus-auth')
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
    createVideoMock.mockResolvedValue({ guid: 'new-video-1', videoLibraryId: 12345 })
    createUploadMock.mockResolvedValue(UPLOAD_URL)
    findOneMock.mockResolvedValue(null)
  })

  it('creates a new video and its upload, and returns the upload URL with short-lived headers', async () => {
    vi.useFakeTimers({ now: 1_700_000_000_000 })
    try {
      const handler = getTusHandler(buildOptions({ tus: { access: () => true, expiresIn: 7200 } }))
      const res = await handler(buildReq(validBody))
      const json = await res.json()

      expect(json).toMatchObject({
        type: 'upload',
        expiresIn: 300,
        libraryId: 12345,
        uploadUrl: UPLOAD_URL,
        videoId: 'new-video-1',
        videoToken: tokenFor('new-video-1'),
      })
      expect(json.headers).toMatchObject({
        AuthorizationExpire: String(1_700_000_000 + 300),
        AuthorizationSignature: expect.any(String),
        LibraryId: '12345',
        VideoId: 'new-video-1',
      })
      expect(createVideoMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'My Clip' }))
      expect(createUploadMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({ AuthorizationExpire: String(1_700_000_000 + 7200) }),
          metadata: expect.objectContaining({ filetype: 'video/mp4', title: 'My Clip' }),
          size: 1000,
          videoId: 'new-video-1',
        }),
      )
      expect(createSessionMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives the browser headers that expire with tus.expiresIn when it is shorter than five minutes', async () => {
    vi.useFakeTimers({ now: 1_700_000_000_000 })
    try {
      const handler = getTusHandler(buildOptions({ tus: { access: () => true, expiresIn: 120 } }))
      const json = await (await handler(buildReq(validBody))).json()

      expect(json.expiresIn).toBe(120)
      expect(json.headers.AuthorizationExpire).toBe(String(1_700_000_000 + 120))
    } finally {
      vi.useRealTimers()
    }
  })

  it('throws 400 when required fields are missing', async () => {
    const handler = getTusHandler(buildOptions())
    await expect(handler(buildReq({ collection: 'media', filename: 'clip.mp4' }))).rejects.toMatchObject({
      status: 400,
    })
  })

  it('throws 403 when access is denied', async () => {
    const handler = getTusHandler(buildOptions({ tus: { access: () => false } }))
    await expect(handler(buildReq(validBody))).rejects.toMatchObject({ status: 403 })
  })

  it('throws 400 when the requested collection has no stream TUS options', async () => {
    const options = createNormalizedOptions({
      collections: { media: { disablePayloadAccessControl: true, stream: { tus: false } } },
      stream: { ...createBaseStream(), tus: { access: () => true } },
    } as never)
    const handler = getTusHandler(options)
    await expect(handler(buildReq(validBody))).rejects.toMatchObject({ status: 400 })
  })

  it('throws 404 when the requested collection is unknown', async () => {
    const handler = getTusHandler(buildOptions())
    await expect(handler(buildReq({ ...validBody, collection: 'ghost' }))).rejects.toMatchObject({ status: 404 })
  })

  it('throws 400 when the resolved title is empty', async () => {
    const handler = getTusHandler(buildOptions())
    await expect(handler(buildReq({ ...validBody, filename: '   ', title: '' }))).rejects.toMatchObject({ status: 400 })
  })

  it('returns type "uploaded" at once when the video is already processed', async () => {
    getVideoMock.mockResolvedValue(tusVideo(4, 1000, 'Existing Title'))

    const handler = getTusHandler(buildOptions())
    const res = await handler(buildReq({ ...validBody, videoId: 'existing-1', videoToken: tokenFor('existing-1') }))
    const json = await res.json()

    expect(json).toEqual({
      type: 'uploaded',
      libraryId: 12345,
      title: 'Existing Title',
      videoId: 'existing-1',
      videoToken: tokenFor('existing-1'),
    })
    expect(getOffsetMock).not.toHaveBeenCalled()
    expect(createVideoMock).not.toHaveBeenCalled()
  })

  it('returns type "uploaded" when the upload is complete but Bunny has not processed the video yet', async () => {
    getVideoMock.mockResolvedValue(tusVideo(0))
    getOffsetMock.mockResolvedValue({ length: 1000, offset: 1000 })

    const handler = getTusHandler(buildOptions())
    const json = await (
      await handler(buildReq({ ...validBody, videoId: 'done-1', videoToken: tokenFor('done-1') }))
    ).json()

    expect(json.type).toBe('uploaded')
    expect(json.videoId).toBe('done-1')
    expect(createVideoMock).not.toHaveBeenCalled()
  })

  it('renews the headers of an unfinished upload and keeps its upload URL', async () => {
    getVideoMock.mockResolvedValue(tusVideo(0))
    getOffsetMock.mockResolvedValue({ length: 1000, offset: 400 })

    const handler = getTusHandler(buildOptions())
    const json = await (
      await handler(buildReq({ ...validBody, videoId: 'reuse-1', videoToken: tokenFor('reuse-1') }))
    ).json()

    expect(json).toMatchObject({
      type: 'upload',
      expiresIn: 300,
      headers: { LibraryId: '12345', VideoId: 'reuse-1' },
      uploadUrl: UPLOAD_URL,
      videoId: 'reuse-1',
      videoToken: tokenFor('reuse-1'),
    })
    expect(getOffsetMock).toHaveBeenCalledWith(expect.objectContaining({ uploadUrl: UPLOAD_URL }))
    expect(createVideoMock).not.toHaveBeenCalled()
    expect(createUploadMock).not.toHaveBeenCalled()
  })

  it.each([
    ['the file size differs from the upload', tusVideo(0, 2000), { length: 2000, offset: 400 }, true],
    ['the video has no upload created by the server', { ...tusVideo(0), metaTags: [] }, undefined, false],
    ['the video failed', tusVideo(6), undefined, true],
  ])('creates a new video when %s', async (_label, video, offset, deletesOld) => {
    getVideoMock.mockResolvedValue(video)
    getOffsetMock.mockResolvedValue(offset)

    const handler = getTusHandler(buildOptions())
    const json = await (
      await handler(buildReq({ ...validBody, videoId: 'reuse-1', videoToken: tokenFor('reuse-1') }))
    ).json()

    expect(json.videoId).toBe('new-video-1')
    expect(createVideoMock).toHaveBeenCalled()
    expect(deleteVideoMock).toHaveBeenCalledTimes(deletesOld ? 1 : 0)
  })

  it('creates a new video and deletes the old one when Bunny no longer knows the upload of an unprocessed video', async () => {
    getVideoMock.mockResolvedValue(tusVideo(0))
    getOffsetMock.mockRejectedValue(notFound())

    const handler = getTusHandler(buildOptions())
    const json = await (
      await handler(buildReq({ ...validBody, videoId: 'reuse-1', videoToken: tokenFor('reuse-1') }))
    ).json()

    expect(json.videoId).toBe('new-video-1')
    expect(findOneMock).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'media', where: { 'bunnyData.stream.videoId': { equals: 'reuse-1' } } }),
    )
    expect(deleteVideoMock).toHaveBeenCalledExactlyOnceWith({
      apiKey: 'stream-key',
      libraryId: 12345,
      videoId: 'reuse-1',
    })
  })

  it('keeps the old video when a document references it', async () => {
    getVideoMock.mockResolvedValue(tusVideo(0))
    getOffsetMock.mockRejectedValue(notFound())
    findOneMock.mockResolvedValue({ id: 'doc-1' })

    const json = await (
      await getTusHandler(buildOptions())(
        buildReq({ ...validBody, videoId: 'reuse-1', videoToken: tokenFor('reuse-1') }),
      )
    ).json()

    expect(json.videoId).toBe('new-video-1')
    expect(deleteVideoMock).not.toHaveBeenCalled()
  })

  it('still creates a new video when the old one cannot be deleted', async () => {
    getVideoMock.mockResolvedValue(tusVideo(0))
    getOffsetMock.mockRejectedValue(notFound())
    deleteVideoMock.mockRejectedValueOnce(new Error('HTTP 500'))
    const req = buildReq({ ...validBody, videoId: 'reuse-1', videoToken: tokenFor('reuse-1') })

    const json = await (await getTusHandler(buildOptions())(req)).json()

    expect(json.videoId).toBe('new-video-1')
    expect((req as { payload: { logger: { warn: unknown } } }).payload.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: '[bunny:stream] tus-auth: failed to delete the replaced video',
        videoId: 'reuse-1',
      }),
    )
  })

  describe('renew mode', () => {
    const renewBody = { ...validBody, renew: true, videoId: 'reuse-1', videoToken: tokenFor('reuse-1') }

    it('returns new headers for the same unfinished upload', async () => {
      getVideoMock.mockResolvedValue(tusVideo(0))
      getOffsetMock.mockResolvedValue({ length: 1000, offset: 400 })

      const json = await (await getTusHandler(buildOptions())(buildReq(renewBody))).json()

      expect(json).toMatchObject({ type: 'upload', expiresIn: 300, uploadUrl: UPLOAD_URL, videoId: 'reuse-1' })
    })

    it('returns uploaded without headers when the upload has finished', async () => {
      getVideoMock.mockResolvedValue(tusVideo(0))
      getOffsetMock.mockResolvedValue({ length: 1000, offset: 1000 })

      const json = await (await getTusHandler(buildOptions())(buildReq(renewBody))).json()

      expect(json.type).toBe('uploaded')
      expect(json).not.toHaveProperty('headers')
    })

    it.each([
      ['a bad token', { videoToken: 'f'.repeat(64) }, () => {}],
      ['no token', { videoToken: undefined }, () => {}],
      ['an unknown video', {}, () => getVideoMock.mockRejectedValue(notFound())],
      [
        'a dead upload',
        {},
        () => {
          getVideoMock.mockResolvedValue(tusVideo(0))
          getOffsetMock.mockRejectedValue(notFound())
        },
      ],
      [
        'another file size',
        { filesize: 2000 },
        () => {
          getVideoMock.mockResolvedValue(tusVideo(0))
          getOffsetMock.mockResolvedValue({ length: 1000, offset: 400 })
        },
      ],
    ])('throws 409 and creates or deletes no video for %s', async (_label, overrides, setup) => {
      setup()

      await expect(getTusHandler(buildOptions())(buildReq({ ...renewBody, ...overrides }))).rejects.toMatchObject({
        message: 'This upload cannot be renewed. Start a new upload.',
        status: 409,
      })
      expect(createVideoMock).not.toHaveBeenCalled()
      expect(createUploadMock).not.toHaveBeenCalled()
      expect(deleteVideoMock).not.toHaveBeenCalled()
    })
  })

  it.each([
    ['no token', undefined],
    ['a forged token', 'f'.repeat(64)],
    ['a token for another collection', tokenFor('reuse-1', 'other')],
    ['a token for another library', tokenFor('reuse-1', 'media', 999)],
  ])('creates a new video when the videoId comes with %s', async (_label, videoToken) => {
    const handler = getTusHandler(buildOptions())
    const res = await handler(buildReq({ ...validBody, videoId: 'reuse-1', videoToken }))
    const json = await res.json()

    expect(getVideoMock).not.toHaveBeenCalled()
    expect(createVideoMock).toHaveBeenCalled()
    expect(json.videoId).toBe('new-video-1')
    expect(json.videoToken).toBe(tokenFor('new-video-1'))
  })

  it('binds the video token to the signed-in user', async () => {
    const user = { collection: 'users', id: 'user-1' }
    const json = await (await getTusHandler(buildOptions())(buildReq(validBody, { user }))).json()

    expect(json.videoToken).toBe(tokenFor('new-video-1', 'media', 12345, user))
    expect(json.videoToken).not.toBe(tokenFor('new-video-1'))
  })

  describe('file checks', () => {
    const buildCheckReq = (body: Record<string, unknown>, upload: Record<string, unknown>, fileSize?: number) =>
      buildStreamReq({
        collections: { media: { upload } },
        json: async () => body,
        payload: { config: { upload: fileSize === undefined ? {} : { limits: { fileSize } } } },
      })

    it.each([
      ['a type outside upload.mimeTypes', { filetype: 'video/webm' }, { mimeTypes: ['video/mp4'] }, 415],
      ['a type the stream options do not accept', { filename: 'a.png', filetype: 'image/png' }, {}, 415],
      ['a restricted file type', { filename: 'clip.html' }, { mimeTypes: ['video/mp4'] }, 415],
      ['an SVG file', { filename: 'a.svg', filetype: 'image/svg+xml' }, {}, 400],
      ['an invalid MIME type', { filetype: 'not a type' }, {}, 400],
      ['a fractional file size', { filesize: 1.5 }, {}, 400],
    ])('rejects %s before creating a video', async (_label, overrides, upload, status) => {
      const handler = getTusHandler(buildOptions())
      await expect(handler(buildCheckReq({ ...validBody, ...overrides }, upload))).rejects.toMatchObject({ status })
      expect(createVideoMock).not.toHaveBeenCalled()
    })

    it('rejects a file over upload.limits.fileSize', async () => {
      const handler = getTusHandler(buildOptions())
      await expect(handler(buildCheckReq(validBody, {}, 999))).rejects.toMatchObject({ status: 413 })
      expect(createVideoMock).not.toHaveBeenCalled()
    })

    it('checks the file before returning an already processed video', async () => {
      getVideoMock.mockResolvedValue(tusVideo(4))

      const handler = getTusHandler(buildOptions())
      const body = { ...validBody, filetype: 'text/html', videoId: 'existing-1', videoToken: tokenFor('existing-1') }
      await expect(handler(buildCheckReq(body, {}))).rejects.toMatchObject({ status: 415 })
      expect(getVideoMock).not.toHaveBeenCalled()
    })
  })

  it('creates a fresh video when Bunny no longer knows the video', async () => {
    getVideoMock.mockRejectedValue(notFound())

    const handler = getTusHandler(buildOptions())
    const res = await handler(buildReq({ ...validBody, videoId: 'missing-1', videoToken: tokenFor('missing-1') }))
    const json = await res.json()

    expect(json.videoId).toBe('new-video-1')
    expect(createVideoMock).toHaveBeenCalled()
  })

  it('throws 500 when the video lookup fails for another reason', async () => {
    getVideoMock.mockRejectedValue(new Error('HTTP 503', { cause: httpError(503) }))

    const handler = getTusHandler(buildOptions())
    await expect(
      handler(buildReq({ ...validBody, videoId: 'missing-1', videoToken: tokenFor('missing-1') })),
    ).rejects.toMatchObject({ status: 500 })
    expect(createVideoMock).not.toHaveBeenCalled()
  })

  it('wraps an unexpected error as a 500', async () => {
    createVideoMock.mockRejectedValue(new Error('boom'))
    const req = buildReq(validBody)
    const handler = getTusHandler(buildOptions())

    await expect(handler(req)).rejects.toMatchObject({ status: 500 })
    expect(
      (req as unknown as { payload: { logger: { error: ReturnType<typeof vi.fn> } } }).payload.logger.error,
    ).toHaveBeenCalled()
  })

  describe('default access control (getAccessResults)', () => {
    const noAccessOptions = () => buildOptions({ tus: true })

    it('grants access with admin access and create access on a configured collection', async () => {
      getAccessResultsMock.mockResolvedValue({
        canAccessAdmin: true,
        collections: { media: { create: true } },
      })

      const handler = getTusHandler(noAccessOptions())
      const res = await handler(buildReq(validBody))
      const json = await res.json()

      expect(json.type).toBe('upload')
    })

    it('denies access without admin access even when create is granted', async () => {
      getAccessResultsMock.mockResolvedValue({
        canAccessAdmin: false,
        collections: { media: { create: true } },
      })

      const handler = getTusHandler(noAccessOptions())
      await expect(handler(buildReq(validBody))).rejects.toMatchObject({ status: 403 })
      expect(createVideoMock).not.toHaveBeenCalled()
    })

    it('replaces the default check with tus.access and skips getAccessResults', async () => {
      const access = vi.fn().mockReturnValue(true)
      const req = buildReq(validBody)

      const res = await getTusHandler(buildOptions({ tus: { access } }))(req)

      expect((await res.json()).type).toBe('upload')
      expect(access).toHaveBeenCalledWith(
        expect.objectContaining({ data: validBody, defaultAccess: expect.any(Function), req }),
      )
      expect(getAccessResultsMock).not.toHaveBeenCalled()
    })

    it('passes defaultAccess so tus.access can narrow the default check', async () => {
      getAccessResultsMock.mockResolvedValue({
        canAccessAdmin: true,
        collections: { media: { create: true } },
      })
      const access = vi.fn(
        async ({ data, defaultAccess }: { data: { filesize: number }; defaultAccess: () => Promise<boolean> }) =>
          data.filesize < 500 && (await defaultAccess()),
      )
      const handler = getTusHandler(buildOptions({ tus: { access } }))

      await expect(handler(buildReq(validBody))).rejects.toMatchObject({ status: 403 })
      expect(getAccessResultsMock).not.toHaveBeenCalled()

      const res = await handler(buildReq({ ...validBody, filesize: 100 }))
      expect((await res.json()).type).toBe('upload')
      expect(getAccessResultsMock).toHaveBeenCalledTimes(1)
    })

    describe('per-collection scope', () => {
      const buildScopedOptions = () =>
        createNormalizedOptions(multiLibraryOptions({ alpha: { tus: true }, beta: { tus: true } }) as never)

      it('allows alpha and denies beta when the user has create only on alpha', async () => {
        getAccessResultsMock.mockResolvedValue({
          canAccessAdmin: true,
          collections: { alpha: { create: true }, beta: { create: false } },
        })
        createVideoMock.mockResolvedValue({ guid: 'v-alpha', videoLibraryId: 111 })

        const handler = getTusHandler(buildScopedOptions())
        await expect(handler(buildMultiReq(betaBody))).rejects.toMatchObject({ status: 403 })
        expect(createVideoMock).not.toHaveBeenCalled()

        const json = await (await handler(buildMultiReq(alphaBody))).json()
        expect(json.type).toBe('upload')
        expect(json.libraryId).toBe(111)
      })
    })
  })

  describe('per-collection Stream libraries', () => {
    const tus = { access: () => true }
    const buildMultiOptions = () =>
      createNormalizedOptions(
        multiLibraryOptions({ alpha: { cleanup: true, tus }, beta: { tus }, stream: { tus } }) as never,
      )

    it('creates the signature and response for the library of the requested collection', async () => {
      createVideoMock.mockResolvedValue({ guid: 'v-alpha', videoLibraryId: 111 })
      const handler = getTusHandler(buildMultiOptions())
      const res = await handler(buildMultiReq(alphaBody))
      const json = await res.json()

      expect(json.libraryId).toBe(111)
      expect(json.headers.LibraryId).toBe('111')
      expect(createUploadMock).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'own-stream-key-111', libraryId: 111 }),
      )
      expect(createVideoMock).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'own-stream-key-111', libraryId: 111 }),
      )
    })

    it('calls getStreamVideo with the collection credentials when reusing a video', async () => {
      getVideoMock.mockResolvedValue(tusVideo(4))

      const handler = getTusHandler(buildMultiOptions())
      await handler(buildMultiReq({ ...betaBody, videoId: 'reuse-b', videoToken: tokenFor('reuse-b', 'beta', 222) }))

      expect(getVideoMock).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'own-stream-key-222', libraryId: 222, videoId: 'reuse-b' }),
      )
    })

    it('creates a session only for a collection with cleanup enabled', async () => {
      createVideoMock.mockResolvedValue({ guid: 'v-alpha', videoLibraryId: 111 })
      const handler = getTusHandler(buildMultiOptions())
      await handler(buildMultiReq(alphaBody))
      expect(createSessionMock).toHaveBeenCalledWith(expect.objectContaining({ libraryId: 111, videoId: 'v-alpha' }))

      createSessionMock.mockClear()
      createVideoMock.mockResolvedValue({ guid: 'v-beta', videoLibraryId: 222 })
      await handler(buildMultiReq(betaBody))
      expect(createSessionMock).not.toHaveBeenCalled()
    })

    it('calls only the access function of the requested collection', async () => {
      const alphaAccess = vi.fn().mockResolvedValue(true)
      const betaAccess = vi.fn().mockResolvedValue(true)
      createVideoMock.mockResolvedValue({ guid: 'v-alpha', videoLibraryId: 111 })

      const options = createNormalizedOptions(
        multiLibraryOptions({
          alpha: { tus: { access: alphaAccess } },
          beta: { tus: { access: betaAccess } },
        }) as never,
      )

      const handler = getTusHandler(options)
      await handler(buildMultiReq(alphaBody))
      expect(alphaAccess).toHaveBeenCalled()
      expect(betaAccess).not.toHaveBeenCalled()
    })

    it('registers the tus-auth endpoint when only a collection has TUS', () => {
      const options = createNormalizedOptions({
        collections: {
          videos: {
            disablePayloadAccessControl: true,
            stream: { apiKey: 'v-key', hostname: 'v.b-cdn.net', libraryId: 900, tus: true },
          },
        },
      } as never)

      const endpoint = getStreamEndpoints(options).find((e) => e.path === '/storage-bunny/stream/tus-auth')
      expect(endpoint).toBeDefined()
    })
  })
})
