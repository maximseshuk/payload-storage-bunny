import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { streamOptions } from '../../../../helpers/unit/context.js'
import { httpError } from '../../../../helpers/unit/httpError.js'
import { buildStreamReq } from '../../../../helpers/unit/stream.js'

const {
  createSessionMock,
  createUploadMock,
  createVideoMock,
  getAccessResultsMock,
  getOffsetMock,
  getOriginalSizeMock,
  getVideoMock,
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  createUploadMock: vi.fn(),
  createVideoMock: vi.fn(),
  getAccessResultsMock: vi.fn(),
  getOffsetMock: vi.fn(),
  getOriginalSizeMock: vi.fn(),
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
  getStreamTusUploadOffset: getOffsetMock,
  getStreamVideo: getVideoMock,
  getStreamVideoOriginalSize: getOriginalSizeMock,
}))

vi.mock('@/server/payload/stream/sessionsCollection.js', () => ({
  createStreamVideoSession: createSessionMock,
}))

const {
  checkStreamTusUpload,
  createStreamTusUploadSession,
  getStreamUploadResponse,
  hasStreamTusAccess,
  isStreamUploadVerified,
} = await import('@/server/payload/stream/tusUpload.js')

const NOW_SECONDS = 1_700_000_000
const UPLOAD_URL = 'https://video.bunnycdn.com/tusupload/upload-1'

const tusVideo = (status: number, length = 1000) => ({
  guid: 'video-1',
  metaTags: [
    { property: 'payload-storage-bunny:upload-url', value: UPLOAD_URL },
    { property: 'payload-storage-bunny:upload-length', value: String(length) },
  ],
  status,
})

const httpFailure = (status: number) => new Error(`HTTP ${status}`, { cause: httpError(status) })

const check = (video: ReturnType<typeof tusVideo>) =>
  checkStreamTusUpload({ streamOptions: streamOptions as never, video: video as never })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: NOW_SECONDS * 1000 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('checkStreamTusUpload', () => {
  it.each([
    ['Error', 5],
    ['UploadFailed', 6],
  ])('rejects a video in the %s state without asking Bunny for the offset', async (_label, status) => {
    await expect(check(tusVideo(status))).resolves.toEqual({
      reason: 'Bunny Stream marked the upload as failed',
      state: 'invalid',
    })
    expect(getOffsetMock).not.toHaveBeenCalled()
  })

  it.each([
    ['has no meta tags', { ...tusVideo(0), metaTags: [] }],
    ['has no upload length', { ...tusVideo(0), metaTags: [tusVideo(0).metaTags[0]] }],
    ['has a zero upload length', tusVideo(0, 0)],
  ])('rejects a video that %s', async (_label, video) => {
    await expect(check(video)).resolves.toEqual({
      reason: 'the video has no upload created by the server',
      state: 'invalid',
    })
    expect(getOffsetMock).not.toHaveBeenCalled()
  })

  it('accepts the upload when the offset equals the length and probes it with short-lived headers', async () => {
    getOffsetMock.mockResolvedValue({ length: 1000, offset: 1000 })

    await expect(check(tusVideo(0))).resolves.toEqual({ length: 1000, state: 'complete' })
    expect(getOffsetMock).toHaveBeenCalledExactlyOnceWith({
      headers: expect.objectContaining({
        AuthorizationExpire: String(NOW_SECONDS + 60),
        LibraryId: '12345',
        VideoId: 'video-1',
      }),
      uploadUrl: UPLOAD_URL,
    })
    expect(getOriginalSizeMock).not.toHaveBeenCalled()
  })

  it.each([
    ['the offset is behind the length', { length: 1000, offset: 400 }],
    ['the length is zero', { length: 0, offset: 0 }],
  ])('reports the upload as incomplete when %s', async (_label, progress) => {
    getOffsetMock.mockResolvedValue(progress)

    await expect(check(tusVideo(0))).resolves.toEqual({
      details: progress,
      reason: 'the upload has not finished yet',
      state: 'incomplete',
    })
  })

  it.each([404, 410])('rejects an unprocessed video when Bunny answers %i for the upload', async (status) => {
    const err = httpFailure(status)
    getOffsetMock.mockRejectedValue(err)

    await expect(check(tusVideo(0))).resolves.toEqual({
      details: { err },
      reason: 'Bunny Stream does not know the upload',
      state: 'invalid',
    })
    expect(getOriginalSizeMock).not.toHaveBeenCalled()
  })

  it.each([
    ['a server error', httpFailure(500)],
    ['a rate limit', httpFailure(429)],
    ['a network error', new Error('socket hang up')],
  ])('rethrows %s from the offset probe', async (_label, err) => {
    getOffsetMock.mockRejectedValue(err)

    await expect(check(tusVideo(4))).rejects.toBe(err)
    expect(getOriginalSizeMock).not.toHaveBeenCalled()
  })

  it('rejects a processed video whose original file size differs from the upload', async () => {
    getOffsetMock.mockRejectedValue(httpFailure(404))
    getOriginalSizeMock.mockResolvedValue(2000)

    await expect(check(tusVideo(4))).resolves.toEqual({
      details: { length: 1000, original: 2000 },
      reason: 'the original file in Bunny Stream does not match the upload size',
      state: 'invalid',
    })
    expect(getOriginalSizeMock).toHaveBeenCalledExactlyOnceWith({
      apiKey: 'stream-key',
      libraryId: 12345,
      videoId: 'video-1',
    })
  })

  it.each([
    ['matches the upload', () => getOriginalSizeMock.mockResolvedValue(1000)],
    ['is unknown', () => getOriginalSizeMock.mockResolvedValue(0)],
    ['cannot be read', () => getOriginalSizeMock.mockRejectedValue(new Error('HTTP 500'))],
  ])('accepts a processed video whose original file size %s', async (_label, setup) => {
    getOffsetMock.mockRejectedValue(httpFailure(404))
    setup()

    await expect(check(tusVideo(1))).resolves.toEqual({ length: 1000, state: 'complete' })
  })
})

describe('hasStreamTusAccess', () => {
  const data = { collection: 'media', filename: 'clip.mp4', filesize: 10, filetype: 'video/mp4', title: 'Clip' }

  it.each([
    ['grants access to an admin user who can create in the collection', true, { media: { create: true } }, true],
    ['denies access without admin access', false, { media: { create: true } }, false],
    ['denies access without create permission', true, { media: { create: false } }, false],
    ['denies access when the collection is missing from the results', true, { other: { create: true } }, false],
  ])('%s by default', async (_label, canAccessAdmin, collections, expected) => {
    getAccessResultsMock.mockResolvedValue({ canAccessAdmin, collections })
    const req = buildStreamReq()

    await expect(hasStreamTusAccess({ data, req, streamOptions: streamOptions as never })).resolves.toBe(expected)
    expect(getAccessResultsMock).toHaveBeenCalledExactlyOnceWith({ req })
  })

  it('uses tus.access instead of the default and passes it the default check', async () => {
    getAccessResultsMock.mockResolvedValue({ canAccessAdmin: true, collections: { media: { create: true } } })
    const access = vi.fn(
      async ({ defaultAccess }: { defaultAccess: () => Promise<boolean> }) => !(await defaultAccess()),
    )
    const req = buildStreamReq()

    await expect(
      hasStreamTusAccess({ data, req, streamOptions: { ...streamOptions, tus: { access } } as never }),
    ).resolves.toBe(false)
    expect(access).toHaveBeenCalledExactlyOnceWith({ data, defaultAccess: expect.any(Function), req })
  })

  it('does not run the default check when tus.access does not call it', async () => {
    const req = buildStreamReq()

    await expect(
      hasStreamTusAccess({ data, req, streamOptions: { ...streamOptions, tus: { access: () => true } } as never }),
    ).resolves.toBe(true)
    expect(getAccessResultsMock).not.toHaveBeenCalled()
  })
})

describe('createStreamTusUploadSession', () => {
  beforeEach(() => {
    createVideoMock.mockResolvedValue({ guid: 'new-video', videoLibraryId: 54321 })
    createUploadMock.mockResolvedValue(UPLOAD_URL)
  })

  const createSession = (overrides: Record<string, unknown> = {}) =>
    createStreamTusUploadSession({
      filesize: 1000,
      filetype: 'video/mp4',
      req: buildStreamReq(),
      streamOptions: { ...streamOptions, tus: { expiresIn: 7200 }, ...overrides } as never,
      title: 'Clip',
    })

  it('creates the video and its upload, and gives the browser headers that expire in five minutes', async () => {
    const session = await createSession()

    expect(createVideoMock).toHaveBeenCalledExactlyOnceWith({
      apiKey: 'stream-key',
      libraryId: 12345,
      thumbnailTime: 5000,
      title: 'Clip',
    })
    expect(createUploadMock).toHaveBeenCalledExactlyOnceWith({
      apiKey: 'stream-key',
      headers: expect.objectContaining({ AuthorizationExpire: String(NOW_SECONDS + 7200), VideoId: 'new-video' }),
      libraryId: 12345,
      metadata: { filetype: 'video/mp4', thumbnailTime: '5000', title: 'Clip' },
      size: 1000,
      videoId: 'new-video',
    })
    expect(session).toEqual({
      expiresIn: 300,
      headers: expect.objectContaining({ AuthorizationExpire: String(NOW_SECONDS + 300), VideoId: 'new-video' }),
      uploadUrl: UPLOAD_URL,
      videoId: 'new-video',
    })
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('leaves thumbnailTime out of the upload metadata when it is not set', async () => {
    await createSession({ thumbnailTime: undefined })

    expect(createUploadMock).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { filetype: 'video/mp4', title: 'Clip' } }),
    )
  })

  it('records a cleanup session in the library of the created video', async () => {
    const req = buildStreamReq()
    await createStreamTusUploadSession({
      filesize: 1000,
      filetype: 'video/mp4',
      req,
      streamOptions: { ...streamOptions, cleanup: { maxAge: 1, schedule: '* * * * *' } } as never,
      title: 'Clip',
    })

    expect(createSessionMock).toHaveBeenCalledExactlyOnceWith({
      libraryId: 54321,
      payload: (req as { payload: unknown }).payload,
      videoId: 'new-video',
    })
  })
})

describe('getStreamUploadResponse', () => {
  const respond = (req = buildStreamReq()) =>
    getStreamUploadResponse({ req, streamOptions: streamOptions as never, videoId: 'video-1' })

  it('returns undefined when Bunny does not know the video', async () => {
    getVideoMock.mockRejectedValue(httpFailure(404))

    await expect(respond()).resolves.toBeUndefined()
  })

  it('rethrows other errors from Bunny', async () => {
    const err = httpFailure(500)
    getVideoMock.mockRejectedValue(err)

    await expect(respond()).rejects.toBe(err)
  })

  it('answers 400, logs the reason and does not mark the upload verified when it is not complete', async () => {
    getVideoMock.mockResolvedValue(tusVideo(0))
    getOffsetMock.mockResolvedValue({ length: 1000, offset: 400 })
    const req = buildStreamReq()

    const res = await respond(req)

    expect(res?.status).toBe(400)
    expect(isStreamUploadVerified(req, 'video-1')).toBe(false)
    expect((req as { payload: { logger: { warn: unknown } } }).payload.logger.warn).toHaveBeenCalledWith({
      length: 1000,
      msg: '[bunny:stream] upload: the upload has not finished yet',
      offset: 400,
      status: 0,
      videoId: 'video-1',
    })
    expect(getVideoMock).toHaveBeenCalledExactlyOnceWith({ apiKey: 'stream-key', libraryId: 12345, videoId: 'video-1' })
  })

  it('answers 206 with the upload length and marks the upload verified for this video only', async () => {
    getVideoMock.mockResolvedValue(tusVideo(0))
    getOffsetMock.mockResolvedValue({ length: 1000, offset: 1000 })
    const req = buildStreamReq()

    const res = await respond(req)

    expect(res?.status).toBe(206)
    expect(res?.headers.get('Content-Range')).toBe('bytes 0-0/1000')
    expect((await res!.arrayBuffer()).byteLength).toBe(1)
    expect(isStreamUploadVerified(req, 'video-1')).toBe(true)
    expect(isStreamUploadVerified(req, 'video-2')).toBe(false)
  })

  it('keeps the existing request context when it marks the upload verified', async () => {
    getVideoMock.mockResolvedValue(tusVideo(0))
    getOffsetMock.mockResolvedValue({ length: 1000, offset: 1000 })
    const req = buildStreamReq({ context: { other: 'value' } })

    await respond(req)

    expect((req as { context: Record<string, unknown> }).context).toEqual({
      bunnyVerifiedStreamUpload: 'video-1',
      other: 'value',
    })
  })
})
