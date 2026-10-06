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

const { createCollectionContext } = await import('@/server/payload/options/context.js')
const { createNormalizedOptions } = await import('@/server/payload/options/normalizer.js')
const { getGenerateUploadInstructions } = await import('@/server/payload/storage/clientUploads/uploadInstructions.js')
const { verifyEdgeUploadUrl } = await import('@/server/payload/storage/clientUploads/mint.js')
const { readClientUpload } = await import('@/server/payload/storage/clientUploads/receipt.js')
const { getGenerateUrl } = await import('@/server/payload/storage/generateUrl.js')
const { buildStoragePathData } = await import('@payloadcms/plugin-cloud-storage/utilities')

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const keyed = (prefix: string, filename = 'photo.jpg') =>
  new RegExp(`^${prefix ? `${prefix}/` : ''}${UUID}${filename ? `/${filename.replace('.', '\\.')}` : ''}$`)

const collection = {
  slug: 'media',
  access: { create: () => true },
  upload: { mimeTypes: ['image/*'] },
}

const buildRequest = (
  overrides: Record<string, unknown> = {},
  collectionConfig: Record<string, unknown> = collection,
) => ({
  payload: {
    collections: { [collectionConfig.slug as string]: { config: collectionConfig } },
    config: { upload: { limits: { fileSize: 5_000_000 } } },
    secret: 'payload-secret',
  },
  t: (key: string) => key,
  user: { collection: 'users', id: 'user-1' },
  ...overrides,
})

type Options = ReturnType<typeof createNormalizedOptions>

const generate = (
  options: Options,
  body: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
  collectionConfig: Record<string, unknown> = collection,
) => {
  const req = buildRequest(overrides, collectionConfig)
  const context = createCollectionContext(options, collectionConfig as never)
  return getGenerateUploadInstructions(context)({ ...body, req } as never) as Promise<any>
}

const photo = { collectionSlug: 'media', filename: 'photo.jpg', filesize: 1000, mimeType: 'image/jpeg' }

const s3Options = () =>
  createNormalizedOptions({
    collections: { media: true },
    storage: {
      apiKey: 'zone-pw',
      clientUploads: {},
      hostname: 'cdn.b-cdn.net',
      s3: true,
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
    await expect(generate(s3Options(), { ...photo, mimeType: 'image/png' }, { user: undefined })).rejects.toMatchObject(
      {
        status: 403,
      },
    )
    expect(presignMock).not.toHaveBeenCalled()
  })

  it('requires collection create or update access by default', async () => {
    const denied = { ...collection, access: { create: () => false, update: () => false } }
    const updateOnly = { ...collection, access: { create: () => false, update: () => true } }

    await expect(generate(s3Options(), photo, {}, denied)).rejects.toMatchObject({ status: 403 })
    expect((await generate(s3Options(), photo, {}, updateOnly)).type).toBe('http')
  })

  it('uses the clientUploads.access callback when set', async () => {
    const options = createNormalizedOptions({
      collections: { media: true },
      storage: {
        apiKey: 'zone-pw',
        clientUploads: { access: () => false },
        hostname: 'cdn.b-cdn.net',
        s3: true,
        zoneName: 'zone',
      },
    } as never)

    await expect(generate(options, photo)).rejects.toMatchObject({ status: 403 })
  })

  it('requires a valid file size', async () => {
    await expect(generate(s3Options(), { ...photo, filesize: undefined })).rejects.toMatchObject({ status: 400 })
    await expect(generate(s3Options(), { ...photo, filesize: -1 })).rejects.toMatchObject({ status: 400 })
    expect(presignMock).not.toHaveBeenCalled()
  })

  it('rejects SVG and XML files', async () => {
    await expect(
      generate(s3Options(), { ...photo, filename: 'logo.svg', mimeType: 'image/svg+xml' }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(generate(s3Options(), { ...photo, filename: 'photo.xml' })).rejects.toMatchObject({ status: 400 })
  })

  it('rejects restricted file types by extension or MIME type', async () => {
    await expect(generate(s3Options(), { ...photo, filename: 'photo.html' })).rejects.toMatchObject({ status: 415 })
    await expect(generate(s3Options(), { ...photo, mimeType: 'text/javascript' })).rejects.toMatchObject({
      status: 415,
    })
    expect(presignMock).not.toHaveBeenCalled()
  })

  it('allows restricted file types when the collection opts in', async () => {
    const permissive = { ...collection, upload: { allowRestrictedFileTypes: true } }
    const instructions = await generate(
      s3Options(),
      { ...photo, filename: 'page.html', mimeType: 'text/html' },
      {},
      permissive,
    )

    expect(instructions.type).toBe('http')
  })

  it('returns 409 when an object already exists at the key', async () => {
    existsMock.mockResolvedValue(true)
    await expect(generate(s3Options(), photo)).rejects.toMatchObject({ status: 409 })
    expect(existsMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringMatching(keyed('')), zoneName: 'zone' }),
    )
    expect(presignMock).not.toHaveBeenCalled()
  })

  it('returns a signed receipt bound to the prefix, size and type', async () => {
    const req = buildRequest()
    const { file } = await getGenerateUploadInstructions(createCollectionContext(s3Options(), collection as never))({
      ...photo,
      req,
    } as never)

    expect(file.uploadReference.prefix).toMatch(keyed('', ''))
    const receipt = verifyClientUploadReceipt({
      collectionSlug: 'media',
      req: req as never,
      signedReceipt: file.uploadReference.signedReceipt as string,
    })
    expect(receipt.filename).toBe('photo.jpg')
    expect(receipt.filePrefix).toBe(file.uploadReference.prefix)
    expect(
      readClientUpload({
        collectionSlug: 'media',
        filename: 'photo.jpg',
        req: req as never,
        uploadReference: file.uploadReference,
      }),
    ).toEqual({ filesize: 1000, mimeType: 'image/jpeg', prefix: file.uploadReference.prefix })
  })

  it('gives Edge uploads of the same filename different keys', async () => {
    const options = createNormalizedOptions({
      collections: { media: { prefix: 'media' } },
      storage: {
        apiKey: 'zone-pw',
        clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'shared' } },
        hostname: 'cdn.b-cdn.net',
        zoneName: 'zone',
      },
    } as never)

    const paths = await Promise.all(
      [1, 2].map(async () => {
        const { request } = await generate(options, photo)
        expect(verifyEdgeUploadUrl(request.url, 'shared').valid).toBe(true)
        return new URL(request.url).searchParams.get('X-Upload-Path')
      }),
    )

    expect(paths[0]).toMatch(keyed('media'))
    expect(paths[1]).toMatch(keyed('media'))
    expect(paths[0]).not.toBe(paths[1])
  })

  it('resolves a document to the key its receipt signed', async () => {
    const options = createNormalizedOptions({
      collections: { media: { prefix: 'media' } },
      storage: {
        apiKey: 'zone-pw',
        clientUploads: {},
        hostname: 'cdn.b-cdn.net',
        s3: true,
        zoneName: 'zone',
      },
    } as never)
    const context = createCollectionContext(options, collection as never)
    const req = buildRequest()

    const { file } = await getGenerateUploadInstructions(context)({ ...photo, req } as never)
    const signedPath = presignMock.mock.calls[0][0].path as string
    const { prefix } = readClientUpload({
      collectionSlug: 'media',
      filename: file.filename,
      req: req as never,
      uploadReference: file.uploadReference,
    })!
    const doc = { filename: file.filename, prefix }

    expect(signedPath).toMatch(keyed('media'))
    expect(
      buildStoragePathData({ collectionPrefix: 'media', docPrefix: doc.prefix, filename: doc.filename }),
    ).toMatchObject({ storageFilePath: signedPath })
    expect(
      getGenerateUrl(context)({ collection: collection as never, data: doc, filename: doc.filename, prefix }),
    ).toBe(`https://cdn.b-cdn.net/${signedPath}`)
  })

  it('rejects a disallowed mime type', async () => {
    await expect(
      generate(s3Options(), {
        collectionSlug: 'media',
        filename: 'doc.pdf',
        filesize: 1000,
        mimeType: 'application/pdf',
      }),
    ).rejects.toMatchObject({ status: 415 })
  })

  it('rejects a file over the size limit', async () => {
    await expect(
      generate(s3Options(), {
        collectionSlug: 'media',
        filename: 'big.png',
        filesize: 9_000_000,
        mimeType: 'image/png',
      }),
    ).rejects.toMatchObject({ status: 413 })
  })

  it('presigns an S3 PUT for the resolved key', async () => {
    const instructions = await generate(s3Options(), photo)

    expect(instructions.type).toBe('http')
    expect(instructions.request.method).toBe('PUT')
    expect(instructions.file).toMatchObject({ filename: 'photo.jpg', mimeType: 'image/jpeg', size: 1000 })
    expect(instructions.request.url).toContain('X-Amz-Signature')
    expect(instructions.request.headers).toEqual({ 'Content-Type': 'image/jpeg', 'If-None-Match': '*' })
    expect(presignMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentLength: 1000,
        contentType: 'image/jpeg',
        path: expect.stringMatching(keyed('')),
        zoneName: 'zone',
      }),
    )
  })

  it('applies a server-side prefix callback to the key', async () => {
    const options = createNormalizedOptions({
      collections: { media: true },
      storage: {
        apiKey: 'zone-pw',
        clientUploads: { prefix: () => 'tenants/acme' },
        hostname: 'cdn.b-cdn.net',
        s3: true,
        zoneName: 'zone',
      },
    } as never)

    const instructions = await generate(options, photo)

    expect(instructions.file.uploadReference.prefix).toMatch(keyed('tenants/acme', ''))
    expect(presignMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${instructions.file.uploadReference.prefix}/photo.jpg` }),
    )
  })

  it('nests a prefix callback result under the static collection prefix', async () => {
    const options = createNormalizedOptions({
      collections: { media: { prefix: 'uploads' } },
      storage: {
        apiKey: 'zone-pw',
        clientUploads: { prefix: () => 'tenants/../acme' },
        hostname: 'cdn.b-cdn.net',
        s3: true,
        zoneName: 'zone',
      },
    } as never)

    const instructions = await generate(options, photo)

    expect(instructions.file.uploadReference.prefix).toMatch(keyed('uploads/tenants/acme', ''))
    expect(presignMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${instructions.file.uploadReference.prefix}/photo.jpg` }),
    )
  })

  it('keeps a prefix callback result already under the static collection prefix', async () => {
    const options = createNormalizedOptions({
      collections: { media: { prefix: 'uploads' } },
      storage: {
        apiKey: 'zone-pw',
        clientUploads: { prefix: () => 'uploads/acme' },
        hostname: 'cdn.b-cdn.net',
        s3: true,
        zoneName: 'zone',
      },
    } as never)

    const instructions = await generate(options, photo)

    expect(instructions.file.uploadReference.prefix).toMatch(keyed('uploads/acme', ''))
    expect(presignMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${instructions.file.uploadReference.prefix}/photo.jpg` }),
    )
  })

  it('creates a signed Edge Script URL in edge mode', async () => {
    const options = createNormalizedOptions({
      collections: { media: true },
      storage: {
        apiKey: 'zone-pw',
        clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'shared' } },
        hostname: 'cdn.b-cdn.net',
        zoneName: 'zone',
      },
    } as never)

    const { request } = await generate(options, photo)

    expect(request.method).toBe('PUT')
    expect(request.url.startsWith('https://uploader.b-cdn.net/upload?')).toBe(true)
    const params = new URL(request.url).searchParams
    expect(params.get('X-Upload-Zone')).toBe('zone')
    expect(params.get('X-Upload-Size')).toBe('1000')
    expect(params.get('X-Upload-Type')).toBe('image/jpeg')
    expect(request.headers).toEqual({ 'Content-Type': 'image/jpeg' })
    expect(verifyEdgeUploadUrl(request.url, 'shared').valid).toBe(true)
    expect(presignMock).not.toHaveBeenCalled()
    expect(existsMock).not.toHaveBeenCalled()
  })

  it('rejects a file over the Edge Script max size', async () => {
    const options = createNormalizedOptions({
      collections: { media: true },
      storage: {
        apiKey: 'zone-pw',
        clientUploads: { edge: { maxSize: 500, scriptUrl: 'https://uploader.b-cdn.net', secret: 'shared' } },
        hostname: 'cdn.b-cdn.net',
        zoneName: 'zone',
      },
    } as never)

    await expect(generate(options, photo)).rejects.toMatchObject({ status: 413 })
  })

  it('rejects instructions for a collection without client uploads', async () => {
    const options = createNormalizedOptions({
      collections: { media: true },
      storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', zoneName: 'zone' },
    } as never)

    await expect(generate(options, photo, {}, collection)).rejects.toMatchObject({ status: 403 })
    await expect(
      getGenerateUploadInstructions(createCollectionContext(options, collection as never))({
        ...photo,
        overrideAccess: true,
        req: buildRequest(),
      } as never),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('sends Stream videos to the TUS handler without creating a storage URL', async () => {
    const options = createNormalizedOptions({
      collections: { media: true },
      storage: {
        apiKey: 'zone-pw',
        clientUploads: {},
        hostname: 'cdn.b-cdn.net',
        s3: true,
        zoneName: 'zone',
      },
      stream: { apiKey: 'stream-key', hostname: 'vz.b-cdn.net', libraryId: 1, tus: true },
    } as never)
    const media = { ...collection, upload: { mimeTypes: ['image/*', 'video/*'] } }

    const video = await generate(options, { ...photo, filename: 'clip.mp4', mimeType: 'video/mp4' }, {}, media)
    const image = await generate(options, photo, {}, media)

    expect(video).toEqual({
      name: 'bunny',
      type: 'dispatch',
      file: { filename: 'clip.mp4', mimeType: 'video/mp4', size: 1000, uploadReference: {} },
    })
    expect(image.type).toBe('http')
    expect(presignMock).toHaveBeenCalledTimes(1)
  })
  describe('per-collection routing', () => {
    const options = createNormalizedOptions({
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
            region: 'ny',
            s3: true,
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
    const generateFor = (slug: string) =>
      generate(options, { ...photo, collectionSlug: slug }, {}, { ...collection, slug })

    it('presigns an S3 PUT for the zone of the override collection, not the global zone', async () => {
      const { request } = await generateFor('ownS3')

      expect(request.method).toBe('PUT')
      expect(presignMock).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 's3-tenant-pw',
          path: expect.stringMatching(keyed('')),
          region: 'ny',
          zoneName: 's3-tenant-zone',
        }),
      )
    })

    it('creates Edge URLs for the override zone and the global sibling, each with its own secret', async () => {
      const own = (await generateFor('ownEdge')).request.url
      const sibling = (await generateFor('sibling')).request.url

      expect(own.startsWith('https://tenant-uploader.b-cdn.net/upload?')).toBe(true)
      expect(new URL(own).searchParams.get('X-Upload-Zone')).toBe('edge-tenant-zone')
      expect(verifyEdgeUploadUrl(own, 'tenant-edge-secret').valid).toBe(true)
      expect(sibling.startsWith('https://global-uploader.b-cdn.net/upload?')).toBe(true)
      expect(new URL(sibling).searchParams.get('X-Upload-Zone')).toBe('global-zone')
      expect(verifyEdgeUploadUrl(sibling, 'global-edge-secret').valid).toBe(true)
      expect(verifyEdgeUploadUrl(sibling, 'tenant-edge-secret').valid).toBe(false)
      expect(presignMock).not.toHaveBeenCalled()
    })
  })
})
