import { describe, expect, it, vi } from 'vitest'

import { EDGE_SCRIPT_SOURCE } from '@/server/payload/storage/clientUploads/embedded.js'
import { mintEdgeUploadUrl } from '@/server/payload/storage/clientUploads/mint.js'

type EdgeHandler = (request: { body: null; headers: Headers; method: string; url: string }) => Promise<Response>

const loadEdgeHandler = (env: Record<string, string>, fetchMock: typeof fetch): EdgeHandler => {
  let handler: EdgeHandler | undefined
  const body = EDGE_SCRIPT_SOURCE.replace(/^import \* as BunnySDK from .*$/m, '')
  new Function('BunnySDK', 'globalThis', 'fetch', body)(
    { net: { http: { serve: (h: EdgeHandler) => (handler = h) } } },
    { Deno: { env: { get: (name: string) => env[name] } } },
    fetchMock,
  )
  return handler!
}

const base = {
  maxSize: 1024,
  path: 'media/photo.jpg',
  scriptUrl: 'https://uploader.b-cdn.net',
  secret: 'shared-secret',
  size: 512,
  type: 'image/jpeg',
  zoneName: 'media',
}

const put = (handler: EdgeHandler, url: string) =>
  handler({ body: null, headers: new Headers({ 'Content-Length': String(base.size) }), method: 'PUT', url })

const setup = (secret = base.secret) => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(null, { status: 201 }))
  const handler = loadEdgeHandler(
    {
      SHARED_SECRET: secret,
      ZONE_MEDIA: JSON.stringify({ accessKey: 'zone-key', host: 'storage.bunnycdn.com' }),
    },
    fetchMock as unknown as typeof fetch,
  )
  return { fetchMock, handler }
}

describe('edge script accepts what mint.ts signs', () => {
  it('uploads a URL minted by mint.ts', async () => {
    const { fetchMock, handler } = setup()
    const res = await put(handler, mintEdgeUploadUrl({ ...base, nonce: 'n' }))

    expect(res.status).toBe(201)
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://storage.bunnycdn.com/media/media/photo.jpg',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('rejects a tampered param', async () => {
    const { fetchMock, handler } = setup()
    const url = mintEdgeUploadUrl({ ...base, nonce: 'n' }).replace('media%2Fphoto.jpg', 'media%2Fevil.jpg')

    expect((await put(handler, url)).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a single flipped signature byte', async () => {
    const { handler } = setup()
    const parsed = new URL(mintEdgeUploadUrl({ ...base, nonce: 'n' }))
    const sig = parsed.searchParams.get('X-Upload-Signature')!
    parsed.searchParams.set('X-Upload-Signature', (sig[0] === '0' ? '1' : '0') + sig.slice(1))

    expect((await put(handler, parsed.toString())).status).toBe(401)
  })

  it('rejects a URL signed with another secret', async () => {
    const { handler } = setup('other-secret')
    expect((await put(handler, mintEdgeUploadUrl({ ...base, nonce: 'n' }))).status).toBe(401)
  })
})
