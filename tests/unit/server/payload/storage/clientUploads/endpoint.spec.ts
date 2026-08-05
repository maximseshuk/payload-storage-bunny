import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSafeFileNameMock, presignMock } = vi.hoisted(() => ({
  getSafeFileNameMock: vi.fn(),
  presignMock: vi.fn(),
}))

vi.mock('@/server/bunny/s3.js', () => ({
  presignStoragePutUrl: presignMock,
}))

vi.mock('@/server/files.js', () => ({
  getSafeFileName: getSafeFileNameMock,
}))

const { createNormalizedConfig } = await import('@/server/payload/config/normalizer.js')
const { getClientUploadHandler } = await import('@/server/payload/storage/clientUploads/endpoint.js')
const { verifyEdgeUploadUrl } = await import('@/server/payload/storage/clientUploads/mint.js')

const collection = {
  slug: 'media',
  upload: { mimeTypes: ['image/*'] },
}

const buildRequest = (body: Record<string, unknown>, overrides: Record<string, unknown> = {}) => ({
  json: async () => body,
  payload: {
    collections: { media: { config: collection } },
    config: { upload: { limits: { fileSize: 5_000_000 } } },
  },
  user: { id: 'user-1' },
  ...overrides,
})

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

  it('rejects a disallowed mime type', async () => {
    const handler = getClientUploadHandler(s3Config())
    const res = await handler(
      buildRequest({ collectionSlug: 'media', filename: 'doc.pdf', mimeType: 'application/pdf' }) as never,
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
    expect(presignMock).toHaveBeenCalledWith(expect.objectContaining({ path: 'photo.jpg', zoneName: 'zone' }))
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
    expect(presignMock).toHaveBeenCalledWith(expect.objectContaining({ path: 'tenants/acme/photo.jpg' }))
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
    expect(new URL(json.url).searchParams.get('X-Upload-Zone')).toBe('zone')
    expect(verifyEdgeUploadUrl(json.url, 'shared').valid).toBe(true)
    expect(presignMock).not.toHaveBeenCalled()
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
