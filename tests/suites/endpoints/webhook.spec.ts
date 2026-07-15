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
  { find = vi.fn(), secret = 'hook-secret', update = vi.fn() }: Record<string, unknown> = {},
) =>
  ({
    json: async () => body,
    payload: {
      collections: { media: { config: collection } },
      find,
      logger: { debug: vi.fn(), error: vi.fn() },
      update,
    },
    url: `http://localhost/api/storage-bunny/stream/webhook?secret=${secret}`,
  }) as never

const getWebhookHandler = (config: ReturnType<typeof buildConfig>) => {
  const endpoint = getStreamEndpoints(config).find((e) => e.path === '/storage-bunny/stream/webhook')
  return endpoint!.handler as (req: never) => Promise<Response>
}

describe('Stream webhook endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for a bad secret', async () => {
    const handler = getWebhookHandler(buildConfig())
    const res = await handler(buildReq({ Status: 3, VideoGuid: 'v1', VideoLibraryId: 12345 }, { secret: 'wrong' }))

    expect(res.status).toBe(401)
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

  it('returns 500 when body parsing throws', async () => {
    const handler = getWebhookHandler(buildConfig())
    const badReq = {
      json: async () => {
        throw new Error('bad json')
      },
      payload: { collections: {}, logger: { debug: vi.fn(), error: vi.fn() } },
      url: 'http://localhost/api/storage-bunny/stream/webhook?secret=hook-secret',
    } as never

    const res = await handler(badReq)
    expect(res.status).toBe(500)
  })
})
