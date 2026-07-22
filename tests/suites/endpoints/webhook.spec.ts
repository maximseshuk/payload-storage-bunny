import { createHmac } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getResolutionsMock, parseMock } = vi.hoisted(() => ({
  getResolutionsMock: vi.fn(),
  parseMock: vi.fn(),
}))

vi.mock('@/stream/api.js', () => ({
  getStreamVideoResolutions: getResolutionsMock,
  parseMp4Resolutions: parseMock,
}))

const { createNormalizedConfig } = await import('@/config/normalizer.js')
const { getStreamEndpoints } = await import('@/stream/endpoints.js')

const collection = { slug: 'media', upload: { mimeTypes: ['video/mp4'] } }

const sign = (rawBody: string, secret: string) => createHmac('sha256', secret).update(rawBody).digest('hex')

const buildConfig = (mp4Fallback = true) =>
  createNormalizedConfig({
    collections: { media: { disablePayloadAccessControl: true } },
    stream: {
      apiKey: 'stream-key',
      hostname: 'stream.b-cdn.net',
      libraryId: 12345,
      mp4Fallback,
      webhook: { secret: 'hook-secret' },
    },
  } as never)

const buildReq = (
  body: Record<string, unknown>,
  {
    algorithm = 'hmac-sha256',
    find = vi.fn(),
    secret = 'hook-secret',
    signature,
    update = vi.fn(),
    version = 'v1',
  }: {
    algorithm?: null | string
    find?: unknown
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

  return {
    headers,
    payload: {
      collections: { media: { config: collection } },
      find,
      logger: { debug: vi.fn(), error: vi.fn() },
      update,
    },
    text: async () => rawBody,
    url: 'http://localhost/api/storage-bunny/stream/webhook',
  } as never
}

const getWebhookHandler = (config: ReturnType<typeof buildConfig>) => {
  const endpoint = getStreamEndpoints(config).find((e) => e.path === '/storage-bunny/stream/webhook')
  return endpoint!.handler as (req: never) => Promise<Response>
}

describe('Stream webhook endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for a signature computed with the wrong secret', async () => {
    const handler = getWebhookHandler(buildConfig())
    const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { secret: 'wrong' }))

    expect(res.status).toBe(401)
  })

  it('returns 401 when the signature header is missing', async () => {
    const handler = getWebhookHandler(buildConfig())
    const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { secret: null }))

    expect(res.status).toBe(401)
  })

  it('returns 401 for a malformed (non-hex, wrong length) signature', async () => {
    const handler = getWebhookHandler(buildConfig())
    const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { signature: 'nope' }))

    expect(res.status).toBe(401)
  })

  it('returns 401 when the signature version or algorithm is unsupported', async () => {
    const handler = getWebhookHandler(buildConfig())
    const body = { Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }

    expect((await handler(buildReq(body, { version: 'v2' }))).status).toBe(401)
    expect((await handler(buildReq(body, { algorithm: 'hmac-sha1' }))).status).toBe(401)
    expect((await handler(buildReq(body, { algorithm: null, version: null }))).status).toBe(401)
  })

  it('returns 400 for an invalid payload', async () => {
    const handler = getWebhookHandler(buildConfig())
    const res = await handler(buildReq({ VideoLibraryId: 12345 }))

    expect(res.status).toBe(400)
  })

  it('returns 403 on a library id mismatch', async () => {
    const handler = getWebhookHandler(buildConfig())
    const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 99999 }))

    expect(res.status).toBe(403)
  })

  it('updates resolutions on a finished (Status 3) webhook', async () => {
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 'doc-1' }] })
    const update = vi.fn().mockResolvedValue({})
    getResolutionsMock.mockResolvedValue({ data: { mp4Resolutions: [{ resolution: '720p' }] }, success: true })
    parseMock.mockReturnValue({ available: ['720p', '480p'], sorted: ['720p', '480p'] })

    const handler = getWebhookHandler(buildConfig())
    const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { find, update }))
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { bunnyData: { stream: { resolutions: { available: ['720p', '480p'], highest: '720p' } } } },
        id: 'doc-1',
      }),
    )
  })

  it('acknowledges non-finished statuses without touching resolutions', async () => {
    const find = vi.fn()
    const handler = getWebhookHandler(buildConfig())
    const res = await handler(buildReq({ Status: 2, VideoGuid: 'v1', VideoLibraryId: 12345 }, { find }))
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(find).not.toHaveBeenCalled()
  })

  it('skips the resolution update when mp4Fallback is disabled', async () => {
    const find = vi.fn()
    const handler = getWebhookHandler(buildConfig(false))
    const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { find }))
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(find).not.toHaveBeenCalled()
  })

  it('acknowledges success even when the resolution lookup throws', async () => {
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 'doc-1' }] })
    const update = vi.fn()
    getResolutionsMock.mockRejectedValue(new Error('bunny down'))

    const handler = getWebhookHandler(buildConfig())
    const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { find, update }))
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('acknowledges success when no matching doc is found', async () => {
    const find = vi.fn().mockResolvedValue({ docs: [] })
    const update = vi.fn()

    const handler = getWebhookHandler(buildConfig())
    const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { find, update }))
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(getResolutionsMock).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('returns 500 when reading the raw body throws', async () => {
    const handler = getWebhookHandler(buildConfig())
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

  describe('multiple stream libraries', () => {
    const alpha = { slug: 'alpha', upload: { mimeTypes: ['video/mp4'] } }
    const beta = { slug: 'beta', upload: { mimeTypes: ['video/mp4'] } }

    const buildMultiConfig = () =>
      createNormalizedConfig({
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
            stream: { apiKey: 'beta-key', hostname: 'beta.b-cdn.net', libraryId: 222, mp4Fallback: false },
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
        find = vi.fn(),
        secret = 'global-hook',
        signature,
        update = vi.fn(),
      }: { find?: unknown; secret?: null | string; signature?: string; update?: unknown } = {},
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
          collections: { alpha: { config: alpha }, beta: { config: beta } },
          find,
          logger: { debug: vi.fn(), error: vi.fn() },
          update,
        },
        text: async () => rawBody,
        url: 'http://localhost/api/storage-bunny/stream/webhook',
      } as never
    }

    it('authenticates a body signed with the library-bound secret', async () => {
      const handler = getWebhookHandler(buildMultiConfig())

      const res = await handler(
        buildMultiReq({ Status: 2, VideoGuid: 'v', VideoLibraryId: 111 }, { secret: 'alpha-hook' }),
      )
      expect((await res.json()).success).toBe(true)
    })

    it('rejects a body signed with another library’s secret (HMAC mismatch)', async () => {
      const handler = getWebhookHandler(buildMultiConfig())

      const res = await handler(
        buildMultiReq({ Status: 2, VideoGuid: 'v', VideoLibraryId: 111 }, { secret: 'global-hook' }),
      )
      expect(res.status).toBe(401)
    })

    it('returns 401 for a library that has no configured webhook secret', async () => {
      const handler = getWebhookHandler(buildMultiConfig())

      const res = await handler(
        buildMultiReq({ Status: 2, VideoGuid: 'v', VideoLibraryId: 222 }, { secret: 'beta-key' }),
      )
      expect(res.status).toBe(401)
    })

    it('returns 403 for a library not in the configured set', async () => {
      const handler = getWebhookHandler(buildMultiConfig())
      const res = await handler(buildMultiReq({ Status: 3, VideoGuid: 'v', VideoLibraryId: 555 }))
      expect(res.status).toBe(403)
    })

    it('searches only collections on the incoming library', async () => {
      const find = vi.fn().mockResolvedValue({ docs: [] })
      const handler = getWebhookHandler(buildMultiConfig())
      await handler(buildMultiReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 111 }, { find, secret: 'alpha-hook' }))

      expect(find).toHaveBeenCalledTimes(1)
      expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'alpha' }))
    })

    it('respects per-collection mp4Fallback and uses the collection credentials', async () => {
      const find = vi.fn().mockResolvedValue({ docs: [{ id: 'doc-a' }] })
      const update = vi.fn().mockResolvedValue({})
      getResolutionsMock.mockResolvedValue({ data: { mp4Resolutions: [{ resolution: '720p' }] }, success: true })
      parseMock.mockReturnValue({ available: ['720p'], sorted: ['720p'] })

      const handler = getWebhookHandler(buildMultiConfig())
      await handler(
        buildMultiReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 111 }, { find, secret: 'alpha-hook', update }),
      )
      expect(getResolutionsMock).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'alpha-key', libraryId: 111 }))

      const findBeta = vi.fn()
      await handler(
        buildMultiReq({ Status: 3, VideoGuid: 'v2', VideoLibraryId: 222 }, { find: findBeta, secret: 'beta-key' }),
      )
      expect(findBeta).not.toHaveBeenCalled()
    })

    it('registers the webhook endpoint when only a collection has a webhook', () => {
      const config = createNormalizedConfig({
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

      const endpoint = getStreamEndpoints(config).find((e) => e.path === '/storage-bunny/stream/webhook')
      expect(endpoint).toBeDefined()
    })
  })
})
