import type { CollectionConfig, PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))
vi.mock('@/server/http/index.js', () => ({ httpFetch: fetchMock }))

import { storageStaticHandler } from '@/server/payload/storage/serveFile.js'
import type { NormalizedStorageOptions } from '@/shared/types/index.js'

import { signed } from '../../../../helpers/unit/signedUrls.js'

const collection = { slug: 'media' } as unknown as CollectionConfig

const storageOptions = (over: Partial<NormalizedStorageOptions> = {}): NormalizedStorageOptions =>
  ({
    apiKey: 'zone-pw',
    hostname: 'cdn.b-cdn.net',
    tokenSecurityKey: 'sec',
    uploadTimeout: 60000,
    zoneName: 'zone',
    ...over,
  }) as NormalizedStorageOptions

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
      storageOptions: storageOptions(),
      usePayloadAccessControl: true,
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(await res.text()).toBe('bytes')

    const fetchedUrl = fetchMock.mock.calls[0][0] as string
    expect(fetchedUrl).toBe('https://cdn.b-cdn.net/photo.jpg')
    expect(fetchedUrl).not.toContain('token=')
  })

  it.each([
    ['a 200', {}, 200],
    ['a 304', { 'if-none-match': '"abc"' }, 304],
  ])('keeps %s response out of shared caches', async (_label, headers, status) => {
    fetchMock.mockResolvedValue(
      new Response(streamBody('x'), {
        headers: { 'cache-control': 'public, max-age=31536000', etag: '"abc"', 'set-cookie': 'cdn=1' },
        status: 200,
      }),
    )

    const res = await storageStaticHandler({
      collection,
      filename: 'photo.jpg',
      req: makeReq(headers),
      signedUrls: false,
      storageOptions: storageOptions(),
      usePayloadAccessControl: true,
    })

    expect(res.status).toBe(status)
    expect(res.headers.get('cache-control')).toBe('private, max-age=31536000')
    expect(res.headers.get('vary')).toBe('Cookie, Authorization')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('etag')).toBe('"abc"')
  })

  it('serves an empty document prefix from under the collection prefix', async () => {
    fetchMock.mockResolvedValue(new Response(streamBody('x'), { status: 200 }))

    await storageStaticHandler({
      collection,
      collectionPrefix: 'media',
      filename: 'photo.jpg',
      prefix: '',
      req: makeReq(),
      signedUrls: false,
      storageOptions: storageOptions(),
      usePayloadAccessControl: true,
    })

    expect(fetchMock.mock.calls[0][0]).toBe('https://cdn.b-cdn.net/media/photo.jpg')
  })

  it('strips the prefix query param from the forwarded CDN URL but keeps other params', async () => {
    fetchMock.mockResolvedValue(new Response(streamBody('x'), { status: 200 }))

    await storageStaticHandler({
      collection,
      filename: 'photo.jpg',
      prefix: 'tenants/acme',
      req: makeReq({}, '/api/media/file/photo.jpg?prefix=tenants/acme&ts=1'),
      signedUrls: false,
      storageOptions: storageOptions(),
      usePayloadAccessControl: true,
    })

    expect(fetchMock.mock.calls[0][0]).toBe('https://cdn.b-cdn.net/tenants/acme/photo.jpg?ts=1')
  })

  it('signs the prefixed path in redirect mode after stripping the prefix param', async () => {
    const res = await storageStaticHandler({
      collection,
      filename: 'photo.jpg',
      prefix: 'tenants/acme',
      req: makeReq({}, '/api/media/file/photo.jpg?prefix=tenants/acme'),
      signedUrls: signed({ redirect: { status: 302 } }),
      storageOptions: storageOptions(),
      usePayloadAccessControl: true,
    })

    const location = res.headers.get('Location') || ''
    expect(res.status).toBe(302)
    expect(location).toContain('tenants/acme/photo.jpg')
    expect(location).not.toContain('prefix=')
    expect(location).toContain('token=')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('signs the fetch URL when signedUrls is enabled without redirect', async () => {
    fetchMock.mockResolvedValue(new Response(streamBody('x'), { status: 200 }))

    await storageStaticHandler({
      collection,
      filename: 'photo.jpg',
      req: makeReq(),
      signedUrls: signed(),
      storageOptions: storageOptions(),
      usePayloadAccessControl: true,
    })

    expect(fetchMock.mock.calls[0][0]).toContain('token=')
  })

  it('forwards the Range header to the upstream fetch', async () => {
    fetchMock.mockResolvedValue(new Response(streamBody('partial'), { status: 206 }))

    await storageStaticHandler({
      collection,
      filename: 'photo.jpg',
      req: makeReq({ range: 'bytes=0-99' }),
      signedUrls: false,
      storageOptions: storageOptions(),
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
      storageOptions: storageOptions(),
      usePayloadAccessControl: true,
    })

    expect(res.status).toBe(404)
    expect(res.statusText).toBe('Not Found')
  })

  it('fetches the whole original for a transformer without redirect, query, Range or 304', async () => {
    fetchMock.mockResolvedValue(new Response(streamBody('full'), { headers: { etag: '"abc"' }, status: 200 }))

    const res = await storageStaticHandler({
      collection,
      filename: 'photo.jpg',
      operation: 'transform',
      req: makeReq({ 'if-none-match': '"abc"', range: 'bytes=0-99' }, '/api/media/file/photo.jpg?width=100'),
      signedUrls: signed({ redirect: { status: 302 } }),
      storageOptions: storageOptions(),
      usePayloadAccessControl: true,
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Headers }]
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('full')
    expect(url).not.toContain('width=')
    expect(url).toContain('token=')
    expect(init.headers.get('Range')).toBeNull()
  })
})
