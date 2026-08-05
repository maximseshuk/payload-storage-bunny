import type { CollectionConfig, PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BunnyDataInternal } from '@/shared/types/core.js'
import type { NormalizedSignedUrlsConfig, NormalizedStreamConfig } from '@/shared/types/index.js'

const { fetchMock, getStreamVideoResolutionsMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getStreamVideoResolutionsMock: vi.fn(),
}))

vi.mock('@/server/http/index.js', () => ({ httpFetch: fetchMock }))

vi.mock('@/server/bunny/stream.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/bunny/stream.js')>()
  return { ...actual, getStreamVideoResolutions: getStreamVideoResolutionsMock }
})

const { streamStaticHandler } = await import('@/server/payload/stream/serveStream.js')

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
    payload: {
      logger: { debug: vi.fn(), error: vi.fn() },
      update: vi.fn().mockResolvedValue({}),
    },
    url: '/api/media/file/video.mp4',
  }) as unknown as PayloadRequest

const streamBody = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })

const okHead = () => new Response(null, { status: 200 })
const okBody = () => new Response(streamBody('video-bytes'), { status: 200 })

const headThenGet = () =>
  fetchMock.mockImplementation((_url: string, init?: { method?: string }) =>
    Promise.resolve(init?.method === 'head' ? okHead() : okBody()),
  )

beforeEach(() => {
  fetchMock.mockReset()
  getStreamVideoResolutionsMock.mockReset()
})

const savedResolutions: BunnyDataInternal = {
  stream: { resolutions: { available: ['720p', '480p'], highest: '720p' }, videoId: 'vid1' },
}

describe('streamStaticHandler', () => {
  it('returns 400 when mp4Fallback is disabled', async () => {
    const res = await streamStaticHandler({
      bunnyData: savedResolutions,
      collection,
      docId: 'doc1',
      req: makeReq(),
      signedUrls: false,
      streamConfig: streamConfig({ mp4Fallback: false }),
      usePayloadAccessControl: false,
    })

    expect(res.status).toBe(400)
    expect(await res.text()).toBe('MP4 fallback not configured.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('proxies the saved-resolution MP4 and injects a video/mp4 content-type', async () => {
    headThenGet()

    const req = makeReq()
    const res = await streamStaticHandler({
      bunnyData: savedResolutions,
      collection,
      docId: 'doc1',
      req,
      signedUrls: false,
      streamConfig: streamConfig(),
      usePayloadAccessControl: false,
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('video/mp4')
    expect(await res.text()).toBe('video-bytes')

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'head' })
    expect(fetchMock.mock.calls[0][0]).toContain('stream.b-cdn.net/vid1/play_720p.mp4')
    expect(getStreamVideoResolutionsMock).not.toHaveBeenCalled()
    expect(req.payload.update).not.toHaveBeenCalled()
  })

  it('sets the Referer header on the upstream requests when configured', async () => {
    headThenGet()

    await streamStaticHandler({
      bunnyData: savedResolutions,
      collection,
      docId: 'doc1',
      req: makeReq(),
      signedUrls: false,
      streamConfig: streamConfig({ referer: 'https://my.site' }),
      usePayloadAccessControl: false,
    })

    const headInit = fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
    expect(headInit.headers.Referer).toBe('https://my.site')
    const getInit = fetchMock.mock.calls[1][1] as { headers: Headers }
    expect(getInit.headers.get('Referer')).toBe('https://my.site')
  })

  it('returns a redirect when signed redirect is enabled', async () => {
    fetchMock.mockResolvedValue(okHead())

    const res = await streamStaticHandler({
      bunnyData: savedResolutions,
      collection,
      docId: 'doc1',
      req: makeReq(),
      signedUrls: signed({ staticHandler: { redirectStatus: 302, useRedirect: true } }),
      streamConfig: streamConfig(),
      usePayloadAccessControl: true,
    })

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('/bcdn_token=')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'head' })
  })

  it('discovers a resolution via the Stream API and persists it when metadata is missing', async () => {
    headThenGet()
    getStreamVideoResolutionsMock.mockResolvedValue({
      data: {
        mp4Resolutions: [
          { path: null, resolution: '720p' },
          { path: null, resolution: '480p' },
        ],
      },
      success: true,
    })

    const req = makeReq()
    const res = await streamStaticHandler({
      bunnyData: { stream: { videoId: 'vid1' } },
      collection,
      docId: 'doc1',
      req,
      signedUrls: false,
      streamConfig: streamConfig(),
      usePayloadAccessControl: false,
    })

    expect(res.status).toBe(200)
    expect(getStreamVideoResolutionsMock).toHaveBeenCalledWith({
      apiKey: 'stream-key',
      libraryId: 12345,
      videoId: 'vid1',
    })
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'media',
        data: { bunnyData: { stream: { resolutions: expect.objectContaining({ highest: '720p' }) } } },
        id: 'doc1',
      }),
    )
  })

  it('returns 404 when the Stream API reports no MP4 resolutions', async () => {
    getStreamVideoResolutionsMock.mockResolvedValue({ data: { mp4Resolutions: [] }, success: false })

    const res = await streamStaticHandler({
      bunnyData: { stream: { videoId: 'vid1' } },
      collection,
      docId: 'doc1',
      req: makeReq(),
      signedUrls: false,
      streamConfig: streamConfig(),
      usePayloadAccessControl: false,
    })

    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Could not determine a valid resolution for the video')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gracefully falls back to 404 when the HEAD check and the Stream API both throw', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    getStreamVideoResolutionsMock.mockRejectedValue(new Error('api down'))

    const req = makeReq()
    const res = await streamStaticHandler({
      bunnyData: savedResolutions,
      collection,
      docId: 'doc1',
      req,
      signedUrls: false,
      streamConfig: streamConfig(),
      usePayloadAccessControl: false,
    })

    expect(res.status).toBe(404)
    expect(req.payload.logger.error).toHaveBeenCalled()
  })
})
