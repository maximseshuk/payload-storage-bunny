import type { CollectionConfig, PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NormalizedSignedUrlsConfig, NormalizedStreamConfig } from '@/types/index.js'

import { httpError } from '../../helpers/unit/httpError.js'

const { kyGetMock } = vi.hoisted(() => ({ kyGetMock: vi.fn() }))

vi.mock('@/utils/kyClient.js', () => ({ kyClient: { get: kyGetMock } }))

const { streamThumbnailStaticHandler } = await import('@/stream/thumbnailStaticHandler.js')

const collection = { slug: 'media' } as unknown as CollectionConfig

const streamConfig = (over: Partial<NormalizedStreamConfig> = {}): NormalizedStreamConfig =>
  ({
    apiKey: 'stream-key',
    hostname: 'stream.b-cdn.net',
    libraryId: 12345,
    mimeTypes: ['video/*'],
    mp4Fallback: true,
    tokenSecurityKey: 'stream-sec',
    uploadTimeout: 300000,
    ...over,
  }) as NormalizedStreamConfig

const signed = (over: Partial<NormalizedSignedUrlsConfig> = {}): NormalizedSignedUrlsConfig =>
  ({ expiresIn: 3600, ...over }) as NormalizedSignedUrlsConfig

const makeReq = (): PayloadRequest =>
  ({
    headers: new Headers({ host: 'app.local' }),
    payload: { logger: { debug: vi.fn(), error: vi.fn() } },
    url: '/api/media/file/thumb',
  }) as unknown as PayloadRequest

const baseArgs = () => ({
  collection,
  req: makeReq(),
  signedUrls: false as const,
  streamConfig: streamConfig(),
  thumbnailType: 'thumbnail.jpg' as const,
  usePayloadAccessControl: false,
  videoId: 'vid1',
})

beforeEach(() => {
  kyGetMock.mockReset()
})

describe('streamThumbnailStaticHandler', () => {
  it('proxies a static thumbnail (thumbnail.jpg)', async () => {
    kyGetMock.mockResolvedValue({
      body: 'jpeg-bytes',
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      status: 200,
    })

    const res = await streamThumbnailStaticHandler(baseArgs())

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(await res.text()).toBe('jpeg-bytes')
    expect(kyGetMock.mock.calls[0][0]).toBe('https://stream.b-cdn.net/vid1/thumbnail.jpg')
  })

  it('proxies an animated preview (preview.webp)', async () => {
    kyGetMock.mockResolvedValue({
      body: 'webp-bytes',
      headers: new Headers({ 'content-type': 'image/webp' }),
      status: 200,
    })

    const res = await streamThumbnailStaticHandler({ ...baseArgs(), thumbnailType: 'preview.webp' })

    expect(res.status).toBe(200)
    expect(kyGetMock.mock.calls[0][0]).toBe('https://stream.b-cdn.net/vid1/preview.webp')
  })

  it('signs the fetch URL when signedUrls is enabled without redirect', async () => {
    kyGetMock.mockResolvedValue({ body: 'x', headers: new Headers(), status: 200 })

    await streamThumbnailStaticHandler({ ...baseArgs(), signedUrls: signed() as never, usePayloadAccessControl: true })

    expect(kyGetMock.mock.calls[0][0]).toContain('token=')
  })

  it('returns a redirect without fetching when signed redirect is enabled', async () => {
    const res = await streamThumbnailStaticHandler({
      ...baseArgs(),
      signedUrls: signed({ staticHandler: { redirectStatus: 302, useRedirect: true } }) as never,
      usePayloadAccessControl: true,
    })

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('token=')
    expect(kyGetMock).not.toHaveBeenCalled()
  })

  it('passes through the upstream status on HTTPError', async () => {
    kyGetMock.mockRejectedValue(httpError(404))

    const res = await streamThumbnailStaticHandler(baseArgs())

    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Thumbnail not found')
  })

  it('returns 500 on a non-HTTP error and logs it', async () => {
    const req = makeReq()
    kyGetMock.mockRejectedValue(new Error('boom'))

    const res = await streamThumbnailStaticHandler({ ...baseArgs(), req })

    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Error fetching thumbnail')
    expect(req.payload.logger.error).toHaveBeenCalled()
  })
})
