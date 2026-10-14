import { createHmac } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { checkSizeMock, requestMock, writeMock } = vi.hoisted(() => ({
  checkSizeMock: vi.fn(),
  requestMock: vi.fn(),
  writeMock: vi.fn(),
}))

vi.mock('@/server/bunny/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/bunny/client.js')>()),
  bunnyRequest: requestMock,
}))

vi.mock('@/server/payload/stream/storedStream.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/payload/stream/storedStream.js')>()),
  checkStreamOriginalSize: checkSizeMock,
  writeStoredStream: writeMock,
}))

const mp4Resolutions = (...resolutions: string[]) => ({
  json: async () => ({ data: { mp4Resolutions: resolutions.map((resolution) => ({ resolution })) }, success: true }),
})

const { createNormalizedOptions } = await import('@/server/payload/options/normalizer.js')
const { getStreamEndpoints } = await import('@/server/payload/stream/endpoints/index.js')

const { createBaseStream, createOwnStream } = await import('../../../../helpers/unit/optionsBuilders.js')
const { buildStreamReq, multiLibraryOptions } = await import('../../../../helpers/unit/stream.js')

const sign = (rawBody: string, secret: string) => createHmac('sha256', secret).update(rawBody).digest('hex')

const storedDoc = (stream: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  bunnyData: { stream: { videoId: 'v1', ...stream } },
})

const expectWrite = (stream: Record<string, unknown>, whenStatus?: null | string, collection = 'media') =>
  expect(writeMock).toHaveBeenCalledExactlyOnceWith({
    collection,
    id: 'doc-1',
    req: expect.anything(),
    stream: { videoId: 'v1', ...stream },
    whenStatus,
  })

const buildOptions = (mp4Fallback = true, status = true) =>
  createNormalizedOptions({
    collections: { media: { disablePayloadAccessControl: true } },
    stream: { ...createBaseStream(), mp4Fallback, status, webhook: { secret: 'hook-secret' } },
  } as never)

const buildMultiOptions = () =>
  createNormalizedOptions(
    multiLibraryOptions({
      alpha: { mp4Fallback: true, webhook: { secret: 'alpha-hook' } },
      beta: { mp4Fallback: false, webhook: { secret: 'beta-hook' } },
      gamma: { mp4Fallback: true },
      stream: { mp4Fallback: true, webhook: { secret: 'global-hook' } },
    }) as never,
  )

const video = { upload: { mimeTypes: ['video/mp4'] } }

const buildReq = (
  body: Record<string, unknown>,
  {
    algorithm = 'hmac-sha256',
    collections = ['media'],
    find = vi.fn(),
    findOne = vi.fn(),
    secret = 'hook-secret',
    signature,
    update = vi.fn(),
    version = 'v1',
  }: {
    algorithm?: null | string
    collections?: string[]
    find?: unknown
    findOne?: unknown
    secret?: null | string
    signature?: string
    update?: unknown
    version?: null | string
  } = {},
) => {
  const rawBody = JSON.stringify(body)
  const headers = new Headers()
  const sig = signature !== undefined ? signature : secret ? sign(rawBody, secret) : undefined
  if (sig) {
    headers.set('x-bunnystream-signature', sig)
  }
  if (version) {
    headers.set('x-bunnystream-signature-version', version)
  }
  if (algorithm) {
    headers.set('x-bunnystream-signature-algorithm', algorithm)
  }

  return buildStreamReq({
    collections: Object.fromEntries(collections.map((slug) => [slug, video])),
    headers,
    payload: { db: { findOne }, find, update },
    text: async () => rawBody,
    url: 'http://localhost/api/storage-bunny/stream/webhook',
  })
}

const buildMultiReq = (body: Record<string, unknown>, overrides: Parameters<typeof buildReq>[1] = {}) =>
  buildReq(body, { collections: ['alpha', 'beta', 'gamma'], secret: 'global-hook', ...overrides })

const getWebhookHandler = (options: ReturnType<typeof buildOptions>) => {
  const endpoint = getStreamEndpoints(options).find((e) => e.path === '/storage-bunny/stream/webhook')
  return endpoint!.handler as (req: never) => Promise<Response>
}

describe('Stream webhook endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    writeMock.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['a signature computed with the wrong secret', 111, { secret: 'wrong' }],
    ['a signature computed with the wrong secret for the global library', 12345, { secret: 'wrong' }],
    ['a signature computed with the secret of another library', 111, {}],
    ['no signature header', 111, { secret: null }],
    ['a malformed (non-hex, wrong length) signature', 111, { signature: 'nope' }],
    ['an unsupported signature version', 111, { secret: 'alpha-hook', version: 'v2' }],
    ['an unsupported signature algorithm', 111, { algorithm: 'hmac-sha1', secret: 'alpha-hook' }],
    ['no signature version or algorithm', 111, { algorithm: null, secret: 'alpha-hook', version: null }],
    ['a library without a webhook secret', 333, {}],
    ['an unknown library', 99999, {}],
  ] as const)('returns 401 for %s', async (_label, VideoLibraryId, overrides) => {
    const res = await getWebhookHandler(buildMultiOptions())(
      buildMultiReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId }, overrides),
    )

    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid payload', async () => {
    const handler = getWebhookHandler(buildOptions())
    const res = await handler(buildReq({ VideoLibraryId: 12345 }))

    expect(res.status).toBe(400)
  })

  it('stores the resolutions and the ready state on a finished (Status 3) webhook', async () => {
    const findOne = vi.fn().mockResolvedValue(storedDoc({ status: 'processing' }))
    requestMock.mockResolvedValue(mp4Resolutions('720p', '480p'))

    const handler = getWebhookHandler(buildOptions())
    const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne }))

    expect((await res.json()).success).toBe(true)
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'media', where: { 'bunnyData.stream.videoId': { equals: 'v1' } } }),
    )
    expectWrite({ resolutions: { available: ['720p', '480p'], highest: '720p' }, status: 'ready' })
  })

  it.each([
    [2, undefined, 'processing', null],
    [3, 'processing', 'ready', 'processing'],
    [5, 'processing', 'failed', 'processing'],
    [8, 'ready', 'failed', 'ready'],
  ])('stores the state of a Status %s webhook over a stored %s state', async (Status, stored, expected, whenStatus) => {
    const findOne = vi.fn().mockResolvedValue(storedDoc({ status: stored }))

    const handler = getWebhookHandler(buildOptions(false))
    await handler(buildReq({ Status, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne }))

    expect(requestMock).not.toHaveBeenCalled()
    expectWrite({ status: expected }, whenStatus)
  })

  it('a Status 3 webhook without mp4Fallback resends the stored resolutions when it writes the ready state', async () => {
    const resolutions = { available: ['720p'], highest: '720p' }
    const findOne = vi.fn().mockResolvedValue(storedDoc({ resolutions, status: 'processing' }))

    const handler = getWebhookHandler(buildOptions(false))
    await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne }))

    expect(requestMock).not.toHaveBeenCalled()
    expectWrite({ resolutions, status: 'ready' }, 'processing')
  })

  it.each([
    [2, 'processing'],
    [4, 'processing'],
    [4, 'ready'],
    [5, 'failed'],
    [1, 'ready'],
    [7, 'failed'],
  ])('writes nothing for a Status %s webhook over a stored %s state', async (Status, stored) => {
    const findOne = vi.fn().mockResolvedValue(storedDoc({ status: stored }))

    const handler = getWebhookHandler(buildOptions())
    const res = await handler(buildReq({ Status, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne }))

    expect((await res.json()).success).toBe(true)
    expect(findOne).toHaveBeenCalled()
    expect(writeMock).not.toHaveBeenCalled()
  })

  it('writes nothing for a finished webhook when the state and resolutions are already stored', async () => {
    const resolutions = { available: ['720p'], highest: '720p' }
    const findOne = vi.fn().mockResolvedValue(storedDoc({ resolutions, status: 'ready' }))
    requestMock.mockResolvedValue(mp4Resolutions('720p'))

    const handler = getWebhookHandler(buildOptions())
    await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne }))

    expect(writeMock).not.toHaveBeenCalled()
  })

  it.each([9, 10])('ignores a Status %s webhook that does not change the encoding state', async (Status) => {
    const findOne = vi.fn()
    const handler = getWebhookHandler(buildOptions())
    const res = await handler(buildReq({ Status, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne }))

    expect((await res.json()).success).toBe(true)
    expect(findOne).not.toHaveBeenCalled()
  })

  it('checks the size of the original file of a video that became ready', async () => {
    const doc = { ...storedDoc({ status: 'processing' }), filesize: 1000 }
    const findOne = vi.fn().mockResolvedValue(doc)
    const req = buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne })

    expect((await (await getWebhookHandler(buildOptions(false))(req)).json()).success).toBe(true)

    expect(checkSizeMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ apiKey: 'stream-key', collection: 'media', doc, libraryId: 12345, videoId: 'v1' }),
    )
  })

  it('skips the size check when another request already stored the ready state', async () => {
    writeMock.mockResolvedValue(false)
    const findOne = vi.fn().mockResolvedValue({ ...storedDoc({ status: 'processing' }), filesize: 1000 })
    const req = buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne })

    expect((await (await getWebhookHandler(buildOptions(false))(req)).json()).success).toBe(true)

    expect(writeMock).toHaveBeenCalledOnce()
    expect(checkSizeMock).not.toHaveBeenCalled()
  })

  it('keeps the stored resolutions and still stores the state when the resolution lookup throws', async () => {
    const resolutions = { available: ['720p'], highest: '720p' }
    const findOne = vi.fn().mockResolvedValue(storedDoc({ resolutions, status: 'processing' }))
    requestMock.mockRejectedValue(new Error('bunny down'))

    const handler = getWebhookHandler(buildOptions())
    const req = buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne })
    const res = await handler(req)

    expect((await res.json()).success).toBe(true)
    expect((req as { payload: { logger: { error: unknown } } }).payload.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ msg: '[bunny:stream] failed to fetch resolutions' }),
    )
    expectWrite({ resolutions, status: 'ready' }, 'processing')
  })

  it.each([
    ['Bunny lists no MP4 resolutions yet', () => requestMock.mockResolvedValue(mp4Resolutions())],
    ['the resolution lookup throws', () => requestMock.mockRejectedValue(new Error('bunny down'))],
  ])(
    'keeps the processing state and answers 500 on a finished webhook when %s, so Bunny sends it again',
    async (_, arrange) => {
      arrange()
      const findOne = vi.fn().mockResolvedValue(storedDoc({ resolutions: null, status: 'processing' }))

      const handler = getWebhookHandler(buildOptions())
      const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne }))

      expect(res.status).toBe(500)
      expect(writeMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['a database error', 3, () => vi.fn().mockRejectedValue(new Error('connection refused')), 0],
    [
      'a failed write',
      5,
      () => {
        writeMock.mockRejectedValue(new Error('write conflict'))
        return vi.fn().mockResolvedValue(storedDoc({ status: 'processing' }))
      },
      1,
    ],
  ])(
    'answers 500 without looking again after %s, so Bunny sends the webhook again',
    async (_, Status, arrange, writes) => {
      vi.useFakeTimers()
      const findOne = arrange()
      const req = buildReq({ Status, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne })

      const res = await getWebhookHandler(buildOptions())(req)

      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'Internal server error' })
      expect(findOne).toHaveBeenCalledTimes(1)
      expect(writeMock).toHaveBeenCalledTimes(writes)
      expect(vi.getTimerCount()).toBe(0)
      expect((req as any).payload.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ msg: '[bunny:stream] webhook: error processing video' }),
      )
    },
  )

  describe('with the status turned off', () => {
    it('stores the resolutions on a finished webhook without payload.update', async () => {
      const find = vi.fn().mockResolvedValue({ docs: [{ id: 'doc-1' }] })
      const update = vi.fn()
      requestMock.mockResolvedValue(mp4Resolutions('720p'))

      const handler = getWebhookHandler(buildOptions(true, false))
      const req = buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { find, update })
      await handler(req)

      expect(find).toHaveBeenCalledWith({
        collection: 'media',
        limit: 1,
        overrideAccess: true,
        req,
        where: { 'bunnyData.stream.videoId': { equals: 'v1' } },
      })
      expectWrite({ resolutions: { available: ['720p'], highest: '720p' } })
      expect(update).not.toHaveBeenCalled()
    })

    it.each([
      ['checks the file size when the resolutions change', undefined, 1],
      ['skips the file size check when a repeated webhook brings the same resolutions', ['720p'], 0],
    ])('%s', async (_label, stored, checks) => {
      const doc = {
        ...storedDoc(stored ? { resolutions: { available: stored, highest: '720p' } } : {}),
        filesize: 1000,
      }
      const find = vi.fn().mockResolvedValue({ docs: [doc] })
      requestMock.mockResolvedValue(mp4Resolutions('720p'))

      await getWebhookHandler(buildOptions(true, false))(
        buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { find }),
      )

      expect(writeMock).toHaveBeenCalledOnce()
      expect(checkSizeMock).toHaveBeenCalledTimes(checks)
    })

    it.each([
      ['Bunny lists no MP4 resolutions yet', () => requestMock.mockResolvedValue(mp4Resolutions())],
      ['the resolution lookup throws', () => requestMock.mockRejectedValue(new Error('bunny down'))],
    ])('answers 500 without writing when %s, so Bunny sends the webhook again', async (_, arrange) => {
      arrange()
      const find = vi.fn().mockResolvedValue({ docs: [{ id: 'doc-1' }] })

      const handler = getWebhookHandler(buildOptions(true, false))
      const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { find }))

      expect(res.status).toBe(500)
      expect(writeMock).not.toHaveBeenCalled()
    })

    it('answers 500 when the document lookup fails', async () => {
      const find = vi.fn().mockRejectedValue(new Error('db down'))

      const handler = getWebhookHandler(buildOptions(true, false))
      const req = buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { find })
      const res = await handler(req)

      expect(res.status).toBe(500)
      expect((req as { payload: { logger: { error: unknown } } }).payload.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ msg: '[bunny:stream] webhook: error processing video' }),
      )
    })

    it.each([
      [4, true],
      [5, true],
      [3, false],
    ])('reads and writes nothing for a Status %s webhook (mp4Fallback %s)', async (Status, mp4Fallback) => {
      const find = vi.fn()
      const findOne = vi.fn()

      const handler = getWebhookHandler(buildOptions(mp4Fallback, false))
      const res = await handler(buildReq({ Status, VideoGuid: 'v1', VideoLibraryId: 12345 }, { find, findOne }))

      expect((await res.json()).success).toBe(true)
      expect(find).not.toHaveBeenCalled()
      expect(findOne).not.toHaveBeenCalled()
      expect(writeMock).not.toHaveBeenCalled()
    })
  })

  describe('when the document does not exist yet', () => {
    it('looks again one second later and stores the state once the document exists', async () => {
      vi.useFakeTimers()
      const findOne = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue(storedDoc({ status: 'processing' }))

      const handler = getWebhookHandler(buildOptions(false))
      const pending = handler(buildReq({ Status: 5, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne }))
      await vi.advanceTimersByTimeAsync(999)
      expect(findOne).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      const res = await pending

      expect((await res.json()).success).toBe(true)
      expect(findOne).toHaveBeenCalledTimes(2)
      expectWrite({ status: 'failed' }, 'processing')
    })

    it.each([3, 5])('gives up after three more lookups for a Status %s webhook', async (Status) => {
      vi.useFakeTimers()
      const findOne = vi.fn().mockResolvedValue(null)

      const handler = getWebhookHandler(buildOptions())
      const pending = handler(buildReq({ Status, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne }))
      await vi.advanceTimersByTimeAsync(3000)
      const res = await pending

      expect((await res.json()).success).toBe(true)
      expect(findOne).toHaveBeenCalledTimes(4)
      expect(requestMock).not.toHaveBeenCalled()
      expect(writeMock).not.toHaveBeenCalled()
    })

    it.each([0, 1, 2, 4, 6, 7, 8])('does not look again for a Status %s webhook', async (Status) => {
      vi.useFakeTimers()
      const findOne = vi.fn().mockResolvedValue(null)

      const handler = getWebhookHandler(buildOptions())
      const res = await handler(buildReq({ Status, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne }))

      expect((await res.json()).success).toBe(true)
      expect(findOne).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('stops looking, logs and answers 500 when a later lookup fails', async () => {
      vi.useFakeTimers()
      const findOne = vi.fn().mockResolvedValueOnce(null).mockRejectedValue(new Error('connection refused'))
      const req = buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne })

      const pending = getWebhookHandler(buildOptions())(req)
      await vi.advanceTimersByTimeAsync(3000)
      const res = await pending

      expect(res.status).toBe(500)
      expect(findOne).toHaveBeenCalledTimes(2)
      expect((req as any).payload.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ msg: '[bunny:stream] webhook: error processing video', videoId: 'v1' }),
      )
    })

    it('does not look again for a collection with the status turned off', async () => {
      vi.useFakeTimers()
      const find = vi.fn().mockResolvedValue({ docs: [] })

      const handler = getWebhookHandler(buildOptions(true, false))
      const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { find }))

      expect((await res.json()).success).toBe(true)
      expect(find).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('returns 500 when reading the raw body throws', async () => {
    const handler = getWebhookHandler(buildOptions())
    const badReq = buildStreamReq({
      headers: new Headers(),
      text: async () => {
        throw new Error('body read failed')
      },
      url: 'http://localhost/api/storage-bunny/stream/webhook',
    })

    const res = await handler(badReq)
    expect(res.status).toBe(500)
  })

  describe('multiple Stream libraries', () => {
    it('searches only collections of the incoming library', async () => {
      const findOne = vi.fn().mockResolvedValue(null)
      const handler = getWebhookHandler(buildMultiOptions())
      await handler(
        buildMultiReq({ Status: 2, VideoGuid: 'v1', VideoLibraryId: 111 }, { findOne, secret: 'alpha-hook' }),
      )

      expect(findOne).toHaveBeenCalledTimes(1)
      expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ collection: 'alpha' }))
    })

    it('respects per-collection mp4Fallback and uses the collection credentials', async () => {
      const findOne = vi.fn().mockResolvedValue(storedDoc())
      requestMock.mockResolvedValue(mp4Resolutions('720p'))

      const handler = getWebhookHandler(buildMultiOptions())
      await handler(
        buildMultiReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 111 }, { findOne, secret: 'alpha-hook' }),
      )
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'own-stream-key-111', url: expect.stringContaining('/library/111/') }),
      )
      expect(writeMock).toHaveBeenCalledWith(expect.objectContaining({ collection: 'alpha' }))

      requestMock.mockClear()
      writeMock.mockClear()
      const findBeta = vi.fn().mockResolvedValue(storedDoc())
      const res = await handler(
        buildMultiReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 222 }, { findOne: findBeta, secret: 'beta-hook' }),
      )
      expect((await res.json()).success).toBe(true)
      expect(findBeta).toHaveBeenCalledWith(expect.objectContaining({ collection: 'beta' }))
      expect(requestMock).not.toHaveBeenCalled()
      expectWrite({ status: 'ready' }, null, 'beta')
    })

    it('registers the webhook endpoint when only a collection has a webhook', () => {
      const options = createNormalizedOptions({
        collections: {
          videos: {
            disablePayloadAccessControl: true,
            stream: createOwnStream(900, { mp4Fallback: true, webhook: { secret: 'only-hook' } }),
          },
        },
      } as never)

      const endpoint = getStreamEndpoints(options).find((e) => e.path === '/storage-bunny/stream/webhook')
      expect(endpoint).toBeDefined()
    })
  })
})
