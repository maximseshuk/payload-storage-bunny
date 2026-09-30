import { beforeEach, describe, expect, it, vi } from 'vitest'

const { existsMock, getSafeFileNameMock, presignMock } = vi.hoisted(() => ({
  existsMock: vi.fn(),
  getSafeFileNameMock: vi.fn(),
  presignMock: vi.fn(),
}))

vi.mock('@/server/bunny/s3.js', () => ({
  presignStoragePutUrl: presignMock,
  storageObjectExistsS3: existsMock,
}))

const { verifyClientUploadReceipt } = await import('payload/internal')

vi.mock('@/server/files.js', () => ({
  getSafeFileName: getSafeFileNameMock,
}))

const { createNormalizedConfig } = await import('@/server/payload/config/normalizer.js')
const { getClientUploadHandler } = await import('@/server/payload/storage/clientUploads/endpoint.js')
const { verifyEdgeUploadUrl } = await import('@/server/payload/storage/clientUploads/mint.js')

const collection = {
  slug: 'media',
  access: { create: () => true },
  upload: { mimeTypes: ['image/*'] },
}

const buildRequest = (
  body: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
  collectionConfig: Record<string, unknown> = collection,
) => ({
  json: async () => body,
  payload: {
    collections: { media: { config: collectionConfig } },
    config: { upload: { limits: { fileSize: 5_000_000 } } },
    secret: 'payload-secret',
  },
  t: (key: string) => key,
  user: { collection: 'users', id: 'user-1' },
  ...overrides,
})

const photo = { collectionSlug: 'media', filename: 'photo.jpg', filesize: 1000, mimeType: 'image/jpeg' }

const s3Config = () =>
  createNormalizedConfig({
    collections: { media: true },
    storage: {
      apiKey: 'zone-pw',
      clientUploads: {},
      hostname: 'cdn.b-cdn.net',
      s3: { region: 'de' },
      zoneName: 'zone',
    },
  } as never)

describe('client upload endpoint', () => {
  beforeEach(() => {
    presignMock.mockReset()
    existsMock.mockReset()
    existsMock.mockResolvedValue(false)
    getSafeFileNameMock.mockReset()
    getSafeFileNameMock.mockImplementation(async ({ desiredFilename }: { desiredFilename: string }) => desiredFilename)
    presignMock.mockResolvedValue('https://de-s3.storage.bunnycdn.com/zone/media/photo.jpg?X-Amz-Signature=abc')
  })

  it('denies unauthenticated requests', async () => {
    const handler = getClientUploadHandler(s3Config())
    const res = await handler(
      buildRequest(
        { collectionSlug: 'media', filename: 'photo.jpg', mimeType: 'image/png' },
        { user: undefined },
      ) as never,
    )
    expect(res.status).toBe(403)
  })

  it('requires collection create or update access by default', async () => {
    const handler = getClientUploadHandler(s3Config())
    const denied = { ...collection, access: { create: () => false, update: () => false } }
    const updateOnly = { ...collection, access: { create: () => false, update: () => true } }

    expect((await handler(buildRequest(photo, {}, denied) as never)).status).toBe(403)
    expect((await handler(buildRequest(photo, {}, updateOnly) as never)).status).toBe(200)
  })

  it('uses the clientUploads.access callback when set', async () => {
    const config = createNormalizedConfig({
      collections: { media: true },
      storage: {
        apiKey: 'zone-pw',
        clientUploads: { access: () => false },
        hostname: 'cdn.b-cdn.net',
        s3: { region: 'de' },
        zoneName: 'zone',
      },
    } as never)

    const res = await getClientUploadHandler(config)(buildRequest(photo) as never)
    expect(res.status).toBe(403)
  })

  it('requires a valid file size', async () => {
    const handler = getClientUploadHandler(s3Config())
    const missing = await handler(buildRequest({ ...photo, filesize: undefined }) as never)
    const negative = await handler(buildRequest({ ...photo, filesize: -1 }) as never)

    expect(missing.status).toBe(400)
    expect(negative.status).toBe(400)
    expect(presignMock).not.toHaveBeenCalled()
  })

  it('rejects SVG and XML files', async () => {
    const handler = getClientUploadHandler(s3Config())
    const svg = await handler(buildRequest({ ...photo, filename: 'logo.svg', mimeType: 'image/svg+xml' }) as never)
    const xml = await handler(buildRequest({ ...photo, filename: 'photo.xml', mimeType: 'image/jpeg' }) as never)

    expect(svg.status).toBe(400)
    expect(xml.status).toBe(400)
  })

  it('rejects restricted file types by extension or MIME type', async () => {
    const handler = getClientUploadHandler(s3Config())
    const html = await handler(buildRequest({ ...photo, filename: 'photo.html' }) as never)
    const script = await handler(buildRequest({ ...photo, mimeType: 'text/javascript' }) as never)

    expect(html.status).toBe(415)
    expect(script.status).toBe(415)
    expect(presignMock).not.toHaveBeenCalled()
  })

  it('allows restricted file types when the collection opts in', async () => {
    const handler = getClientUploadHandler(s3Config())
    const permissive = { ...collection, upload: { allowRestrictedFileTypes: true } }
    const res = await handler(
      buildRequest({ ...photo, filename: 'page.html', mimeType: 'text/html' }, {}, permissive) as never,
    )

    expect(res.status).toBe(200)
  })

  it('returns 409 when an object already exists at the key', async () => {
    existsMock.mockResolvedValue(true)
    const handler = getClientUploadHandler(s3Config())
    const res = await handler(buildRequest(photo) as never)

    expect(res.status).toBe(409)
    expect(existsMock).toHaveBeenCalledWith(expect.objectContaining({ path: 'photo.jpg', zoneName: 'zone' }))
    expect(presignMock).not.toHaveBeenCalled()
  })

  it('returns a signed receipt bound to the prefix, size and type', async () => {
    const handler = getClientUploadHandler(s3Config())
    const req = buildRequest(photo)
    const json = await (await handler(req as never)).json()

    expect(json.clientUploadContext.prefix).toBe('')
    const receipt = verifyClientUploadReceipt({
      collectionSlug: 'media',
      req: req as never,
      signedReceipt: json.clientUploadContext.signedReceipt,
    })
    expect(receipt.filename).toBe('photo.jpg')
    expect(receipt.context).toEqual({ filesize: 1000, mimeType: 'image/jpeg', prefix: '' })
  })

  it('rejects a disallowed mime type', async () => {
    const handler = getClientUploadHandler(s3Config())
    const res = await handler(
      buildRequest({
        collectionSlug: 'media',
        filename: 'doc.pdf',
        filesize: 1000,
        mimeType: 'application/pdf',
      }) as never,
    )
    expect(res.status).toBe(415)
  })

  it('rejects a file over the size limit', async () => {
    const handler = getClientUploadHandler(s3Config())
    const res = await handler(
      buildRequest({
        collectionSlug: 'media',
        filename: 'big.png',
        filesize: 9_000_000,
        mimeType: 'image/png',
      }) as never,
    )
    expect(res.status).toBe(413)
  })

  it('presigns an S3 PUT for the resolved key', async () => {
    const handler = getClientUploadHandler(s3Config())
    const res = await handler(
      buildRequest({ collectionSlug: 'media', filename: 'photo.jpg', filesize: 1000, mimeType: 'image/jpeg' }) as never,
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.method).toBe('PUT')
    expect(json.filename).toBe('photo.jpg')
    expect(json.url).toContain('X-Amz-Signature')
    expect(json.headers).toEqual({ 'Content-Type': 'image/jpeg', 'If-None-Match': '*' })
    expect(presignMock).toHaveBeenCalledWith(
      expect.objectContaining({ contentLength: 1000, contentType: 'image/jpeg', path: 'photo.jpg', zoneName: 'zone' }),
    )
  })

  it('applies a server-side prefix callback to the key', async () => {
    const config = createNormalizedConfig({
      collections: { media: true },
      storage: {
        apiKey: 'zone-pw',
        clientUploads: { prefix: () => 'tenants/acme' },
        hostname: 'cdn.b-cdn.net',
        s3: { region: 'de' },
        zoneName: 'zone',
      },
    } as never)

    const handler = getClientUploadHandler(config)
    const res = await handler(
      buildRequest({ collectionSlug: 'media', filename: 'photo.jpg', filesize: 1000, mimeType: 'image/jpeg' }) as never,
    )
    const json = await res.json()

    expect(json.prefix).toBe('tenants/acme')
    expect(json.clientUploadContext.prefix).toBe('tenants/acme')
    expect(presignMock).toHaveBeenCalledWith(expect.objectContaining({ path: 'tenants/acme/photo.jpg' }))
  })

  it('nests a prefix callback result under the static collection prefix', async () => {
    const config = createNormalizedConfig({
      collections: { media: { prefix: 'uploads' } },
      storage: {
        apiKey: 'zone-pw',
        clientUploads: { prefix: () => 'tenants/../acme' },
        hostname: 'cdn.b-cdn.net',
        s3: { region: 'de' },
        zoneName: 'zone',
      },
    } as never)

    const json = await (await getClientUploadHandler(config)(buildRequest(photo) as never)).json()

    expect(json.prefix).toBe('uploads/tenants/acme')
    expect(json.clientUploadContext.prefix).toBe('uploads/tenants/acme')
    expect(presignMock).toHaveBeenCalledWith(expect.objectContaining({ path: 'uploads/tenants/acme/photo.jpg' }))
  })

  it('keeps a prefix callback result already under the static collection prefix', async () => {
    const config = createNormalizedConfig({
      collections: { media: { prefix: 'uploads' } },
      storage: {
        apiKey: 'zone-pw',
        clientUploads: { prefix: () => 'uploads/acme' },
        hostname: 'cdn.b-cdn.net',
        s3: { region: 'de' },
        zoneName: 'zone',
      },
    } as never)

    const json = await (await getClientUploadHandler(config)(buildRequest(photo) as never)).json()

    expect(json.prefix).toBe('uploads/acme')
    expect(presignMock).toHaveBeenCalledWith(expect.objectContaining({ path: 'uploads/acme/photo.jpg' }))
  })

  it('mints a signed Edge Script URL in edge mode', async () => {
    const config = createNormalizedConfig({
      collections: { media: true },
      storage: {
        apiKey: 'zone-pw',
        clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'shared' } },
        hostname: 'cdn.b-cdn.net',
        zoneName: 'zone',
      },
    } as never)

    const handler = getClientUploadHandler(config)
    const res = await handler(
      buildRequest({ collectionSlug: 'media', filename: 'photo.jpg', filesize: 1000, mimeType: 'image/jpeg' }) as never,
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.url.startsWith('https://uploader.b-cdn.net/upload?')).toBe(true)
    const params = new URL(json.url).searchParams
    expect(params.get('X-Upload-Zone')).toBe('zone')
    expect(params.get('X-Upload-Size')).toBe('1000')
    expect(params.get('X-Upload-Type')).toBe('image/jpeg')
    expect(json.headers).toEqual({ 'Content-Type': 'image/jpeg' })
    expect(verifyEdgeUploadUrl(json.url, 'shared').valid).toBe(true)
    expect(presignMock).not.toHaveBeenCalled()
    expect(existsMock).not.toHaveBeenCalled()
  })

  it('signs the per-collection storage zone, not the global one', async () => {
    const config = createNormalizedConfig({
      collections: {
        media: {
          storage: {
            apiKey: 'tenant-a-pw',
            clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'shared' } },
            hostname: 'tenant-a.b-cdn.net',
            zoneName: 'tenant-a',
          },
        },
      },
      storage: {
        apiKey: 'zone-pw',
        clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'shared' } },
        hostname: 'cdn.b-cdn.net',
        zoneName: 'zone',
      },
    } as never)

    const handler = getClientUploadHandler(config)
    const res = await handler(
      buildRequest({ collectionSlug: 'media', filename: 'photo.jpg', filesize: 1000, mimeType: 'image/jpeg' }) as never,
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(new URL(json.url).searchParams.get('X-Upload-Zone')).toBe('tenant-a')
    expect(verifyEdgeUploadUrl(json.url, 'shared').valid).toBe(true)
  })
})
