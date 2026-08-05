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

const collections = {
  ownEdge: { slug: 'ownEdge', upload: { mimeTypes: ['image/*'] } },
  ownS3: { slug: 'ownS3', upload: { mimeTypes: ['image/*'] } },
  sibling: { slug: 'sibling', upload: { mimeTypes: ['image/*'] } },
}

const config = createNormalizedConfig({
  collections: {
    ownEdge: {
      disablePayloadAccessControl: true,
      storage: {
        apiKey: 'edge-tenant-pw',
        clientUploads: { edge: { scriptUrl: 'https://tenant-uploader.b-cdn.net', secret: 'tenant-edge-secret' } },
        hostname: 'edge-tenant.b-cdn.net',
        zoneName: 'edge-tenant-zone',
      },
    },
    ownS3: {
      disablePayloadAccessControl: true,
      storage: {
        apiKey: 's3-tenant-pw',
        clientUploads: {},
        hostname: 's3-tenant.b-cdn.net',
        s3: { region: 'ny' },
        zoneName: 's3-tenant-zone',
      },
    },
    sibling: { disablePayloadAccessControl: true },
  },
  storage: {
    apiKey: 'global-pw',
    clientUploads: { edge: { scriptUrl: 'https://global-uploader.b-cdn.net', secret: 'global-edge-secret' } },
    hostname: 'global.b-cdn.net',
    zoneName: 'global-zone',
  },
} as never)

const buildRequest = (collectionSlug: string, filename = 'photo.jpg') => ({
  json: async () => ({ collectionSlug, filename, filesize: 1000, mimeType: 'image/jpeg' }),
  payload: {
    collections: {
      ownEdge: { config: collections.ownEdge },
      ownS3: { config: collections.ownS3 },
      sibling: { config: collections.sibling },
    },
    config: { upload: { limits: { fileSize: 5_000_000 } } },
  },
  user: { id: 'user-1' },
})

describe('per-collection client upload routing', () => {
  beforeEach(() => {
    presignMock.mockReset()
    getSafeFileNameMock.mockReset()
    getSafeFileNameMock.mockImplementation(async ({ desiredFilename }: { desiredFilename: string }) => desiredFilename)
    presignMock.mockResolvedValue('https://ny-s3.storage.bunnycdn.com/s3-tenant-zone/photo.jpg?X-Amz-Signature=abc')
  })

  it('presigns an S3 PUT against the override collection s3 zone, not the global one', async () => {
    const handler = getClientUploadHandler(config)
    const res = await handler(buildRequest('ownS3') as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.method).toBe('PUT')
    expect(presignMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 's3-tenant-pw',
        path: 'photo.jpg',
        s3: { region: 'ny' },
        zoneName: 's3-tenant-zone',
      }),
    )
  })

  it('mints an edge URL signing the override collection zone, not the global one', async () => {
    const handler = getClientUploadHandler(config)
    const res = await handler(buildRequest('ownEdge') as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.url.startsWith('https://tenant-uploader.b-cdn.net/upload?')).toBe(true)
    expect(new URL(json.url).searchParams.get('X-Upload-Zone')).toBe('edge-tenant-zone')
    expect(verifyEdgeUploadUrl(json.url, 'tenant-edge-secret').valid).toBe(true)
    expect(presignMock).not.toHaveBeenCalled()
  })

  it('routes the sibling collection to the global zone (edge)', async () => {
    const handler = getClientUploadHandler(config)
    const res = await handler(buildRequest('sibling') as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.url.startsWith('https://global-uploader.b-cdn.net/upload?')).toBe(true)
    expect(new URL(json.url).searchParams.get('X-Upload-Zone')).toBe('global-zone')
    expect(verifyEdgeUploadUrl(json.url, 'global-edge-secret').valid).toBe(true)
    expect(verifyEdgeUploadUrl(json.url, 'tenant-edge-secret').valid).toBe(false)
    expect(presignMock).not.toHaveBeenCalled()
  })
})
