import type { Payload, PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteStorageFileMock, httpFetchMock, uploadStorageFileMock } = vi.hoisted(() => ({
  deleteStorageFileMock: vi.fn(),
  httpFetchMock: vi.fn(),
  uploadStorageFileMock: vi.fn(),
}))

vi.mock('@/server/bunny/storage.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  deleteStorageFile: deleteStorageFileMock,
  uploadStorageFile: uploadStorageFileMock,
}))

vi.mock('@/server/http/index.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  httpFetch: httpFetchMock,
}))

const { bunnyStorage } = await import('../../../../../src/index.js')
const { buildConfigWithDefaults } = await import('../../../../helpers/shared/buildConfigWithDefaults.js')
const { createMediaCollection } = await import('../../../../helpers/shared/createMediaCollection.js')

const PROXY_SLUG = 'prefix-proxy-media'
const DIRECT_SLUG = 'prefix-direct-media'
const HOSTNAME = 'storage.example.com'

const upload = { imageSizes: [{ name: 'thumb', width: 4 }] }

const uploadedPaths = (): string[] => uploadStorageFileMock.mock.calls.map(([args]) => args.path).toSorted()
const deletedPaths = (): string[] => deleteStorageFileMock.mock.calls.map(([args]) => args.path).toSorted()

describe('storage object keys for a document created with prefix: "" in a prefixed collection', () => {
  let payload: Payload
  let image: Buffer

  beforeAll(async () => {
    image = await sharp({ create: { background: '#f00', channels: 3, height: 8, width: 8 } })
      .png()
      .toBuffer()

    payload = await getPayload({
      config: await buildConfigWithDefaults({
        collections: [
          createMediaCollection({ slug: PROXY_SLUG, upload }),
          createMediaCollection({ slug: DIRECT_SLUG, upload }),
        ],
        storage: [
          bunnyStorage({
            collections: {
              [DIRECT_SLUG]: { disablePayloadAccessControl: true, prefix: 'media', signedUrls: false },
              [PROXY_SLUG]: { prefix: 'media', signedUrls: false },
            },
            storage: { apiKey: 'x', hostname: HOSTNAME, zoneName: 'zone' },
          }),
        ],
      }),
      key: 'storage-path-prefix',
    })
  })

  afterAll(async () => {
    await payload?.destroy?.()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    uploadStorageFileMock.mockResolvedValue(undefined)
    deleteStorageFileMock.mockResolvedValue(undefined)
    httpFetchMock.mockResolvedValue(new Response('ok', { status: 200 }))
  })

  const createWithEmptyPrefix = (collection: typeof DIRECT_SLUG | typeof PROXY_SLUG, name: string) =>
    payload.create({
      collection,
      data: { alt: 'a', prefix: '' },
      file: { data: image, mimetype: 'image/png', name, size: image.length },
      overrideAccess: true,
    })

  const keys = (prefix: string, doc: Record<string, unknown>): string[] =>
    [
      `${prefix}/${doc.filename}`,
      `${prefix}/${(doc.sizes as { thumb: { filename: string } }).thumb.filename}`,
    ].toSorted()

  it('uploads the original and every image size beneath the collection prefix', async () => {
    const doc = await createWithEmptyPrefix(PROXY_SLUG, 'upload-root.png')

    expect(doc.prefix).toBe('')
    expect(uploadedPaths()).toEqual(keys('media', doc))
  })

  it('deletes the keys it uploaded', async () => {
    const doc = await createWithEmptyPrefix(PROXY_SLUG, 'delete-root.png')
    const written = uploadedPaths()

    await payload.delete({ collection: PROXY_SLUG, id: doc.id, overrideAccess: true })

    expect(deletedPaths()).toEqual(keys('media', doc))
    expect(deletedPaths()).toEqual(written)
  })

  it('serves the uploaded key through the Payload file proxy', async () => {
    const doc = await createWithEmptyPrefix(PROXY_SLUG, 'serve-root.png')

    const handler = payload.collections[PROXY_SLUG].config.upload.handlers![0]
    await handler(
      {
        headers: new Headers(),
        payload,
        url: `http://localhost/api/${PROXY_SLUG}/file/${doc.filename}`,
      } as never as PayloadRequest,
      { doc: doc as never, params: { collection: PROXY_SLUG, filename: doc.filename! } },
    )

    expect(httpFetchMock.mock.calls[0][0]).toBe(`https://${HOSTNAME}/media/${doc.filename}`)
  })

  it('returns a direct URL that points at the uploaded key', async () => {
    const doc = await createWithEmptyPrefix(DIRECT_SLUG, 'url-root.png')

    const read = await payload.findByID({ collection: DIRECT_SLUG, id: doc.id, overrideAccess: true })

    expect(read.url).toBe(`https://${HOSTNAME}/media/${doc.filename}`)
  })

  it('keeps resolving a legacy stored prefix outside the collection prefix to its existing keys', async () => {
    const created = await createWithEmptyPrefix(DIRECT_SLUG, 'legacy.png')
    await payload.db.updateOne({ collection: DIRECT_SLUG, data: { prefix: 'legacy' }, id: created.id })
    const doc = await payload.findByID({ collection: DIRECT_SLUG, id: created.id, overrideAccess: true })

    expect(doc.url).toBe(`https://${HOSTNAME}/legacy/${doc.filename}`)

    await payload.delete({ collection: DIRECT_SLUG, id: doc.id, overrideAccess: true })

    expect(deletedPaths()).toEqual(keys('legacy', doc))
  })
})
