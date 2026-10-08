import { createHmac } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }))

vi.mock('@/server/bunny/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/bunny/client.js')>()),
  bunnyRequest: requestMock,
}))

const mp4Resolutions = (...resolutions: string[]) => ({
  json: async () => ({ data: { mp4Resolutions: resolutions.map((resolution) => ({ resolution })) }, success: true }),
})

const { createNormalizedOptions } = await import('@/server/payload/options/normalizer.js')
const { getStreamEndpoints } = await import('@/server/payload/stream/endpoints.js')

const collection = { slug: 'media', upload: { mimeTypes: ['video/mp4'] } }

const sign = (rawBody: string, secret: string) => createHmac('sha256', secret).update(rawBody).digest('hex')

const storedDoc = (stream: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  bunnyData: { stream: { videoId: 'v1', ...stream } },
})

const statusWhere = (id: string, status: Record<string, unknown>) => ({
  and: [
    { id: { equals: id } },
    { 'bunnyData.stream.videoId': { equals: 'v1' } },
    { 'bunnyData.stream.status': status },
  ],
})

const buildOptions = (mp4Fallback = true, status = true) =>
  createNormalizedOptions({
    collections: { media: { disablePayloadAccessControl: true } },
    stream: {
      apiKey: 'stream-key',
      hostname: 'stream.b-cdn.net',
      libraryId: 12345,
      mp4Fallback,
      status,
      webhook: { secret: 'hook-secret' },
    },
  } as never)

const buildReq = (
  body: Record<string, unknown>,
  {
    algorithm = 'hmac-sha256',
    find = vi.fn(),
    findOne = vi.fn(),
    secret = 'hook-secret',
    signature,
    update = vi.fn(),
    updateOne = vi.fn(),
    version = 'v1',
  }: {
    algorithm?: null | string
    find?: unknown
    findOne?: unknown
    secret?: null | string
    signature?: string
    update?: unknown
    updateOne?: unknown
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

  return {
    headers,
    payload: {
      collections: { media: { config: collection } },
      db: { findOne, updateOne },
      find,
      logger: { debug: vi.fn(), error: vi.fn() },
      update,
    },
    text: async () => rawBody,
    url: 'http://localhost/api/storage-bunny/stream/webhook',
  } as never
}

const getWebhookHandler = (options: ReturnType<typeof buildOptions>) => {
  const endpoint = getStreamEndpoints(options).find((e) => e.path === '/storage-bunny/stream/webhook')
  return endpoint!.handler as (req: never) => Promise<Response>
}

describe('Stream webhook endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for a signature computed with the wrong secret', async () => {
    const handler = getWebhookHandler(buildOptions())
    const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { secret: 'wrong' }))

    expect(res.status).toBe(401)
  })

  it('returns 401 when the signature header is missing', async () => {
    const handler = getWebhookHandler(buildOptions())
    const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { secret: null }))

    expect(res.status).toBe(401)
  })

  it('returns 401 for a malformed (non-hex, wrong length) signature', async () => {
    const handler = getWebhookHandler(buildOptions())
    const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { signature: 'nope' }))

    expect(res.status).toBe(401)
  })

  it('returns 401 when the signature version or algorithm is unsupported', async () => {
    const handler = getWebhookHandler(buildOptions())
    const body = { Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }

    expect((await handler(buildReq(body, { version: 'v2' }))).status).toBe(401)
    expect((await handler(buildReq(body, { algorithm: 'hmac-sha1' }))).status).toBe(401)
    expect((await handler(buildReq(body, { algorithm: null, version: null }))).status).toBe(401)
  })

  it('returns 400 for an invalid payload', async () => {
    const handler = getWebhookHandler(buildOptions())
    const res = await handler(buildReq({ VideoLibraryId: 12345 }))

    expect(res.status).toBe(400)
  })

  it('returns 403 on a library id mismatch', async () => {
    const handler = getWebhookHandler(buildOptions())
    const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 99999 }))

    expect(res.status).toBe(403)
  })

  it('stores the resolutions and the ready state on a finished (Status 3) webhook', async () => {
    const findOne = vi.fn().mockResolvedValue(storedDoc({ status: 'processing' }))
    const updateOne = vi.fn().mockResolvedValue(null)
    requestMock.mockResolvedValue(mp4Resolutions('720p', '480p'))

    const handler = getWebhookHandler(buildOptions())
    const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne, updateOne }))

    expect((await res.json()).success).toBe(true)
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'media', where: { 'bunnyData.stream.videoId': { equals: 'v1' } } }),
    )
    expect(updateOne).toHaveBeenCalledTimes(1)
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'media',
        data: {
          bunnyData: {
            stream: { resolutions: { available: ['720p', '480p'], highest: '720p' }, status: 'ready', videoId: 'v1' },
          },
          updatedAt: null,
        },
        select: { id: true },
        where: { and: [{ id: { equals: 'doc-1' } }, { 'bunnyData.stream.videoId': { equals: 'v1' } }] },
      }),
    )
  })

  it.each([
    [2, undefined, 'processing', { exists: false }],
    [3, 'processing', 'ready', { equals: 'processing' }],
    [5, 'processing', 'failed', { equals: 'processing' }],
    [8, 'ready', 'failed', { equals: 'ready' }],
  ])('stores the state of a Status %s webhook over a stored %s state', async (Status, stored, expected, where) => {
    const findOne = vi.fn().mockResolvedValue(storedDoc({ status: stored }))
    const updateOne = vi.fn().mockResolvedValue(null)

    const handler = getWebhookHandler(buildOptions(false))
    await handler(buildReq({ Status, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne, updateOne }))

    expect(requestMock).not.toHaveBeenCalled()
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { bunnyData: { stream: { status: expected, videoId: 'v1' } }, updatedAt: null },
        where: statusWhere('doc-1', where),
      }),
    )
  })

  it('keeps a stored processing state on a Status 4 webhook, because the first resolution cannot play yet', async () => {
    const findOne = vi.fn().mockResolvedValue(storedDoc({ status: 'processing' }))
    const updateOne = vi.fn().mockResolvedValue(null)

    const handler = getWebhookHandler(buildOptions())
    await handler(buildReq({ Status: 4, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne, updateOne }))

    expect(updateOne).not.toHaveBeenCalled()
  })

  it('a Status 3 webhook without mp4Fallback resends the stored resolutions when it writes the ready state', async () => {
    const resolutions = { available: ['720p'], highest: '720p' }
    const findOne = vi.fn().mockResolvedValue(storedDoc({ resolutions, status: 'processing' }))
    const updateOne = vi.fn().mockResolvedValue(null)

    const handler = getWebhookHandler(buildOptions(false))
    await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne, updateOne }))

    expect(requestMock).not.toHaveBeenCalled()
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { bunnyData: { stream: { resolutions, status: 'ready', videoId: 'v1' } }, updatedAt: null },
      }),
    )
  })

  it.each([
    [2, 'processing'],
    [4, 'ready'],
    [5, 'failed'],
    [1, 'ready'],
    [7, 'failed'],
  ])('writes nothing for a Status %s webhook over a stored %s state', async (Status, stored) => {
    const findOne = vi.fn().mockResolvedValue(storedDoc({ status: stored }))
    const updateOne = vi.fn()

    const handler = getWebhookHandler(buildOptions())
    const res = await handler(buildReq({ Status, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne, updateOne }))

    expect((await res.json()).success).toBe(true)
    expect(findOne).toHaveBeenCalled()
    expect(updateOne).not.toHaveBeenCalled()
  })

  it('writes nothing for a finished webhook when the state and resolutions are already stored', async () => {
    const resolutions = { available: ['720p'], highest: '720p' }
    const findOne = vi.fn().mockResolvedValue(storedDoc({ resolutions, status: 'ready' }))
    const updateOne = vi.fn()
    requestMock.mockResolvedValue(mp4Resolutions('720p'))

    const handler = getWebhookHandler(buildOptions())
    await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne, updateOne }))

    expect(updateOne).not.toHaveBeenCalled()
  })

  it.each([9, 10])('ignores a Status %s webhook that does not change the encoding state', async (Status) => {
    const findOne = vi.fn()
    const handler = getWebhookHandler(buildOptions())
    const res = await handler(buildReq({ Status, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne }))

    expect((await res.json()).success).toBe(true)
    expect(findOne).not.toHaveBeenCalled()
  })

  it('stores the ready state without resolutions when mp4Fallback is disabled', async () => {
    const findOne = vi.fn().mockResolvedValue(storedDoc({ status: 'processing' }))
    const updateOne = vi.fn().mockResolvedValue(null)
    const handler = getWebhookHandler(buildOptions(false))
    const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne, updateOne }))

    expect((await res.json()).success).toBe(true)
    expect(requestMock).not.toHaveBeenCalled()
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { bunnyData: { stream: { status: 'ready', videoId: 'v1' } }, updatedAt: null },
        where: statusWhere('doc-1', { equals: 'processing' }),
      }),
    )
  })

  it('keeps the stored resolutions and still stores the state when the resolution lookup throws', async () => {
    const resolutions = { available: ['720p'], highest: '720p' }
    const findOne = vi.fn().mockResolvedValue(storedDoc({ resolutions, status: 'processing' }))
    const updateOne = vi.fn().mockResolvedValue(null)
    requestMock.mockRejectedValue(new Error('bunny down'))

    const handler = getWebhookHandler(buildOptions())
    const req = buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne, updateOne })
    const res = await handler(req)

    expect((await res.json()).success).toBe(true)
    expect((req as { payload: { logger: { error: unknown } } }).payload.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ msg: '[bunny:stream] failed to fetch resolutions' }),
    )
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { bunnyData: { stream: { resolutions, status: 'ready', videoId: 'v1' } }, updatedAt: null },
        where: statusWhere('doc-1', { equals: 'processing' }),
      }),
    )
  })

  it.each([
    ['Bunny lists no MP4 resolutions yet', () => requestMock.mockResolvedValue(mp4Resolutions())],
    ['the resolution lookup throws', () => requestMock.mockRejectedValue(new Error('bunny down'))],
  ])(
    'keeps the processing state and answers 500 on a finished webhook when %s, so Bunny sends it again',
    async (_, arrange) => {
      arrange()
      const findOne = vi.fn().mockResolvedValue(storedDoc({ resolutions: null, status: 'processing' }))
      const updateOne = vi.fn()

      const handler = getWebhookHandler(buildOptions())
      const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne, updateOne }))

      expect(res.status).toBe(500)
      expect(updateOne).not.toHaveBeenCalled()
    },
  )

  it('writes only while the document still points at the video of the webhook', async () => {
    const findOne = vi.fn().mockResolvedValue(storedDoc({ status: 'processing' }))
    const updateOne = vi.fn().mockResolvedValue(null)

    const handler = getWebhookHandler(buildOptions(false))
    await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne, updateOne }))

    const where = updateOne.mock.calls[0][0].where.and
    expect(where).toContainEqual({ 'bunnyData.stream.videoId': { equals: 'v1' } })
  })

  describe('with the status turned off', () => {
    it('stores the resolutions straight to the database on a finished webhook, without payload.update', async () => {
      const find = vi.fn().mockResolvedValue({ docs: [{ id: 'doc-1' }] })
      const update = vi.fn()
      const findOne = vi.fn().mockResolvedValue(storedDoc())
      const updateOne = vi.fn().mockResolvedValue({ id: 'doc-1' })
      requestMock.mockResolvedValue(mp4Resolutions('720p'))

      const handler = getWebhookHandler(buildOptions(true, false))
      const req = buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { find, findOne, update, updateOne })
      await handler(req)

      expect(find).toHaveBeenCalledWith({
        collection: 'media',
        limit: 1,
        overrideAccess: true,
        req,
        where: { 'bunnyData.stream.videoId': { equals: 'v1' } },
      })
      expect(updateOne).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          collection: 'media',
          data: {
            bunnyData: { stream: { resolutions: { available: ['720p'], highest: '720p' }, videoId: 'v1' } },
            updatedAt: null,
          },
          req,
          where: { and: [{ id: { equals: 'doc-1' } }, { 'bunnyData.stream.videoId': { equals: 'v1' } }] },
        }),
      )
      expect(update).not.toHaveBeenCalled()
    })

    it.each([
      ['Bunny lists no MP4 resolutions yet', () => requestMock.mockResolvedValue(mp4Resolutions())],
      ['the resolution lookup throws', () => requestMock.mockRejectedValue(new Error('bunny down'))],
    ])('answers 500 without writing when %s, so Bunny sends the webhook again', async (_, arrange) => {
      arrange()
      const find = vi.fn().mockResolvedValue({ docs: [{ id: 'doc-1' }] })
      const update = vi.fn()

      const handler = getWebhookHandler(buildOptions(true, false))
      const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { find, update }))

      expect(res.status).toBe(500)
      expect(update).not.toHaveBeenCalled()
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
      const updateOne = vi.fn()

      const handler = getWebhookHandler(buildOptions(mp4Fallback, false))
      const res = await handler(
        buildReq({ Status, VideoGuid: 'v1', VideoLibraryId: 12345 }, { find, findOne, updateOne }),
      )

      expect((await res.json()).success).toBe(true)
      expect(find).not.toHaveBeenCalled()
      expect(findOne).not.toHaveBeenCalled()
      expect(updateOne).not.toHaveBeenCalled()
    })
  })

  describe('when the document does not exist yet', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('looks again one second later and stores the state once the document exists', async () => {
      vi.useFakeTimers()
      const findOne = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue(storedDoc({ status: 'processing' }))
      const updateOne = vi.fn().mockResolvedValue({ id: 'doc-1' })

      const handler = getWebhookHandler(buildOptions(false))
      const pending = handler(buildReq({ Status: 5, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne, updateOne }))
      await vi.advanceTimersByTimeAsync(999)
      expect(findOne).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      const res = await pending

      expect((await res.json()).success).toBe(true)
      expect(findOne).toHaveBeenCalledTimes(3)
      expect(updateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { bunnyData: { stream: { status: 'failed', videoId: 'v1' } }, updatedAt: null },
          where: statusWhere('doc-1', { equals: 'processing' }),
        }),
      )
    })

    it.each([3, 5])('gives up after three more lookups for a Status %s webhook', async (Status) => {
      vi.useFakeTimers()
      const findOne = vi.fn().mockResolvedValue(null)
      const updateOne = vi.fn()

      const handler = getWebhookHandler(buildOptions())
      const pending = handler(buildReq({ Status, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne, updateOne }))
      await vi.advanceTimersByTimeAsync(3000)
      const res = await pending

      expect((await res.json()).success).toBe(true)
      expect(findOne).toHaveBeenCalledTimes(4)
      expect(requestMock).not.toHaveBeenCalled()
      expect(updateOne).not.toHaveBeenCalled()
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

    it('answers 500 without looking again after a database error, so Bunny sends the webhook again', async () => {
      vi.useFakeTimers()
      const findOne = vi.fn().mockRejectedValue(new Error('connection refused'))
      const req = buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne })

      const res = await getWebhookHandler(buildOptions())(req)

      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'Internal server error' })
      expect(findOne).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
      expect((req as any).payload.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ msg: '[bunny:stream] webhook: error processing video' }),
      )
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

  it('answers 500 when storing the state fails', async () => {
    const findOne = vi.fn().mockResolvedValue(storedDoc({ status: 'processing' }))
    const updateOne = vi.fn().mockRejectedValue(new Error('write conflict'))
    const req = buildReq({ Status: 5, VideoGuid: 'v1', VideoLibraryId: 12345 }, { findOne, updateOne })

    const res = await getWebhookHandler(buildOptions())(req)

    expect(res.status).toBe(500)
    expect(updateOne).toHaveBeenCalledOnce()
  })

  it('returns 500 when reading the raw body throws', async () => {
    const handler = getWebhookHandler(buildOptions())
    const badReq = {
      headers: new Headers(),
      payload: { collections: {}, logger: { debug: vi.fn(), error: vi.fn() } },
      text: async () => {
        throw new Error('body read failed')
      },
      url: 'http://localhost/api/storage-bunny/stream/webhook',
    } as never

    const res = await handler(badReq)
    expect(res.status).toBe(500)
  })

  describe('multiple Stream libraries', () => {
    const alpha = { slug: 'alpha', upload: { mimeTypes: ['video/mp4'] } }
    const beta = { slug: 'beta', upload: { mimeTypes: ['video/mp4'] } }
    const gamma = { slug: 'gamma', upload: { mimeTypes: ['video/mp4'] } }

    const buildMultiOptions = () =>
      createNormalizedOptions({
        collections: {
          alpha: {
            disablePayloadAccessControl: true,
            stream: {
              apiKey: 'alpha-key',
              hostname: 'alpha.b-cdn.net',
              libraryId: 111,
              mp4Fallback: true,
              webhook: { secret: 'alpha-hook' },
            },
          },
          beta: {
            disablePayloadAccessControl: true,
            stream: {
              apiKey: 'beta-key',
              hostname: 'beta.b-cdn.net',
              libraryId: 222,
              mp4Fallback: false,
              webhook: { secret: 'beta-hook' },
            },
          },
          gamma: {
            disablePayloadAccessControl: true,
            stream: { apiKey: 'gamma-key', hostname: 'gamma.b-cdn.net', libraryId: 333, mp4Fallback: true },
          },
        },
        stream: {
          apiKey: 'stream-key',
          hostname: 'stream.b-cdn.net',
          libraryId: 12345,
          mp4Fallback: true,
          webhook: { secret: 'global-hook' },
        },
      } as never)

    const buildMultiReq = (
      body: Record<string, unknown>,
      {
        findOne = vi.fn(),
        secret = 'global-hook',
        signature,
        updateOne = vi.fn(),
      }: { findOne?: unknown; secret?: null | string; signature?: string; updateOne?: unknown } = {},
    ) => {
      const rawBody = JSON.stringify(body)
      const headers = new Headers()
      const sig = signature !== undefined ? signature : secret ? sign(rawBody, secret) : undefined
      if (sig) {
        headers.set('x-bunnystream-signature', sig)
        headers.set('x-bunnystream-signature-version', 'v1')
        headers.set('x-bunnystream-signature-algorithm', 'hmac-sha256')
      }

      return {
        headers,
        payload: {
          collections: { alpha: { config: alpha }, beta: { config: beta }, gamma: { config: gamma } },
          db: { findOne, updateOne },
          logger: { debug: vi.fn(), error: vi.fn() },
        },
        text: async () => rawBody,
        url: 'http://localhost/api/storage-bunny/stream/webhook',
      } as never
    }

    it('authenticates a body signed with the library-bound secret', async () => {
      const handler = getWebhookHandler(buildMultiOptions())

      const res = await handler(
        buildMultiReq({ Status: 2, VideoGuid: 'v', VideoLibraryId: 111 }, { secret: 'alpha-hook' }),
      )
      expect((await res.json()).success).toBe(true)
    })

    it('rejects a body signed with the secret of another library', async () => {
      const handler = getWebhookHandler(buildMultiOptions())

      const res = await handler(
        buildMultiReq({ Status: 2, VideoGuid: 'v', VideoLibraryId: 111 }, { secret: 'global-hook' }),
      )
      expect(res.status).toBe(401)
    })

    it('returns 401 for a library that has no configured webhook secret', async () => {
      const handler = getWebhookHandler(buildMultiOptions())

      const res = await handler(
        buildMultiReq({ Status: 2, VideoGuid: 'v', VideoLibraryId: 333 }, { secret: 'global-hook' }),
      )
      expect(res.status).toBe(401)
    })

    it('returns 403 for a library not in the configured set', async () => {
      const handler = getWebhookHandler(buildMultiOptions())
      const res = await handler(buildMultiReq({ Status: 3, VideoGuid: 'v', VideoLibraryId: 555 }))
      expect(res.status).toBe(403)
    })

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
      const updateOne = vi.fn().mockResolvedValue(null)
      requestMock.mockResolvedValue(mp4Resolutions('720p'))

      const handler = getWebhookHandler(buildMultiOptions())
      await handler(
        buildMultiReq(
          { Status: 3, VideoGuid: 'v1', VideoLibraryId: 111 },
          { findOne, secret: 'alpha-hook', updateOne },
        ),
      )
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'alpha-key', url: expect.stringContaining('/library/111/') }),
      )
      expect(updateOne).toHaveBeenCalledWith(expect.objectContaining({ collection: 'alpha' }))

      requestMock.mockClear()
      const findBeta = vi.fn().mockResolvedValue(storedDoc())
      const updateBeta = vi.fn().mockResolvedValue(null)
      const res = await handler(
        buildMultiReq(
          { Status: 3, VideoGuid: 'v1', VideoLibraryId: 222 },
          { findOne: findBeta, secret: 'beta-hook', updateOne: updateBeta },
        ),
      )
      expect((await res.json()).success).toBe(true)
      expect(findBeta).toHaveBeenCalledWith(expect.objectContaining({ collection: 'beta' }))
      expect(requestMock).not.toHaveBeenCalled()
      expect(updateBeta).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'beta',
          data: { bunnyData: { stream: { status: 'ready', videoId: 'v1' } }, updatedAt: null },
        }),
      )
    })

    it('registers the webhook endpoint when only a collection has a webhook', () => {
      const options = createNormalizedOptions({
        collections: {
          videos: {
            disablePayloadAccessControl: true,
            stream: {
              apiKey: 'v-key',
              hostname: 'v.b-cdn.net',
              libraryId: 900,
              mp4Fallback: true,
              webhook: { secret: 'only-hook' },
            },
          },
        },
      } as never)

      const endpoint = getStreamEndpoints(options).find((e) => e.path === '/storage-bunny/stream/webhook')
      expect(endpoint).toBeDefined()
    })
  })
})
