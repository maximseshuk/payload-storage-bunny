import type { CollectionConfig, PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))
vi.mock('@/server/http/index.js', () => ({ httpFetch: fetchMock }))

import { storageStaticHandler } from '@/server/payload/storage/serveFile.js'
import type { NormalizedSignedUrlsConfig, NormalizedStorageConfig } from '@/shared/types/index.js'

const collection = { slug: 'media' } as unknown as CollectionConfig

const storageConfig = (over: Partial<NormalizedStorageConfig> = {}): NormalizedStorageConfig =>
  ({
    apiKey: 'zone-pw',
    hostname: 'cdn.b-cdn.net',
    tokenSecurityKey: 'sec',
    uploadTimeout: 60000,
    zoneName: 'zone',
    ...over,
  }) as NormalizedStorageConfig

const signed = (over: Partial<NormalizedSignedUrlsConfig> = {}): NormalizedSignedUrlsConfig =>
  ({ expiresIn: 3600, ...over }) as NormalizedSignedUrlsConfig

const makeReq = (headers: Record<string, string> = {}, url = '/api/media/file/photo.jpg'): PayloadRequest =>
  ({
    headers: new Headers({ host: 'app.local', ...headers }),
    payload: { logger: { debug: vi.fn(), error: vi.fn() } },
    url,
  }) as unknown as PayloadRequest

const streamBody = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })

beforeEach(() => {
  fetchMock.mockReset()
})

describe('storageStaticHandler', () => {
  it('proxies an unsigned upstream response', async () => {
    fetchMock.mockResolvedValue(
      new Response(streamBody('bytes'), { headers: { 'content-type': 'image/jpeg' }, status: 200 }),
    )

    const res = await storageStaticHandler({
      collection,
      filename: 'photo.jpg',
      req: makeReq(),
      signedUrls: false,
      storageConfig: storageConfig(),
      usePayloadAccessControl: true,
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(await res.text()).toBe('bytes')

    const fetchedUrl = fetchMock.mock.calls[0][0] as string
    expect(fetchedUrl).toBe('https://cdn.b-cdn.net/photo.jpg')
    expect(fetchedUrl).not.toContain('token=')
  })

  it('joins the prefix and appends the incoming query string to the upstream URL', async () => {
    fetchMock.mockResolvedValue(new Response(streamBody('x'), { status: 200 }))

    await storageStaticHandler({
      collection,
      filename: 'photo.jpg',
      prefix: 'tenants/acme',
      req: makeReq({}, '/api/media/file/photo.jpg?width=100'),
      signedUrls: false,
      storageConfig: storageConfig(),
      usePayloadAccessControl: true,
    })

    expect(fetchMock.mock.calls[0][0]).toBe('https://cdn.b-cdn.net/tenants/acme/photo.jpg?width=100')
  })

  it('strips the prefix query param from the forwarded CDN URL but keeps other params', async () => {
    fetchMock.mockResolvedValue(new Response(streamBody('x'), { status: 200 }))

    await storageStaticHandler({
      collection,
      filename: 'photo.jpg',
      prefix: 'tenants/acme',
      req: makeReq({}, '/api/media/file/photo.jpg?prefix=tenants/acme&ts=1'),
      signedUrls: false,
      storageConfig: storageConfig(),
      usePayloadAccessControl: true,
    })

    const fetchedUrl = fetchMock.mock.calls[0][0] as string
    expect(fetchedUrl).toContain('ts=1')
    expect(fetchedUrl).not.toContain('prefix=')
    expect(fetchedUrl).toContain('tenants/acme/photo.jpg')
  })

  it('signs the prefixed path in redirect mode after stripping the prefix param', async () => {
    const res = await storageStaticHandler({
      collection,
      filename: 'photo.jpg',
      prefix: 'tenants/acme',
      req: makeReq({}, '/api/media/file/photo.jpg?prefix=tenants/acme'),
      signedUrls: signed({ staticHandler: { redirectStatus: 302, useRedirect: true } }),
      storageConfig: storageConfig(),
      usePayloadAccessControl: true,
    })

    const location = res.headers.get('Location') || ''
    expect(res.status).toBe(302)
    expect(location).toContain('tenants/acme/photo.jpg')
    expect(location).not.toContain('prefix=')
    expect(location).toContain('token=')
  })

  it('signs the fetch URL when signedUrls is enabled without redirect', async () => {
    fetchMock.mockResolvedValue(new Response(streamBody('x'), { status: 200 }))

    await storageStaticHandler({
      collection,
      filename: 'photo.jpg',
      req: makeReq(),
      signedUrls: signed(),
      storageConfig: storageConfig(),
      usePayloadAccessControl: true,
    })

    expect(fetchMock.mock.calls[0][0]).toContain('token=')
  })

  it('returns a redirect without fetching when signed redirect is enabled', async () => {
    const res = await storageStaticHandler({
      collection,
      filename: 'photo.jpg',
      req: makeReq(),
      signedUrls: signed({ staticHandler: { redirectStatus: 302, useRedirect: true } }),
      storageConfig: storageConfig(),
      usePayloadAccessControl: true,
    })

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('token=')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards the Range header to the upstream fetch', async () => {
    fetchMock.mockResolvedValue(new Response(streamBody('partial'), { status: 206 }))

    await storageStaticHandler({
      collection,
      filename: 'photo.jpg',
      req: makeReq({ range: 'bytes=0-99' }),
      signedUrls: false,
      storageConfig: storageConfig(),
      usePayloadAccessControl: true,
    })

    const init = fetchMock.mock.calls[0][1] as { headers: Headers }
    expect(init.headers.get('Range')).toBe('bytes=0-99')
  })

  it('returns 404 when the upstream response is not ok', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))

    const res = await storageStaticHandler({
      collection,
      filename: 'missing.jpg',
      req: makeReq(),
      signedUrls: false,
      storageConfig: storageConfig(),
      usePayloadAccessControl: true,
    })

    expect(res.status).toBe(404)
    expect(res.statusText).toBe('Not Found')
  })

  it('returns 304 when the request etag matches the upstream etag', async () => {
    fetchMock.mockResolvedValue(new Response(streamBody('x'), { headers: { etag: '"abc"' }, status: 200 }))

    const res = await storageStaticHandler({
      collection,
      filename: 'photo.jpg',
      req: makeReq({ 'if-none-match': '"abc"' }),
      signedUrls: false,
      storageConfig: storageConfig(),
      usePayloadAccessControl: true,
    })

    expect(res.status).toBe(304)
    expect(res.headers.get('etag')).toBe('"abc"')
  })
})
