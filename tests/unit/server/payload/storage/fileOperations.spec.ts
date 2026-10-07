import { beforeEach, describe, expect, it, vi } from 'vitest'

const { copyMock, copyS3Mock, deleteMock, deleteS3Mock, deleteVideoMock, purgeMock } = vi.hoisted(() => ({
  copyMock: vi.fn(),
  copyS3Mock: vi.fn(),
  deleteMock: vi.fn(),
  deleteS3Mock: vi.fn(),
  deleteVideoMock: vi.fn(),
  purgeMock: vi.fn(),
}))

vi.mock('@/server/bunny/storage.js', () => ({ copyStorageFile: copyMock, deleteStorageFile: deleteMock }))
vi.mock('@/server/bunny/s3.js', () => ({ copyStorageFileS3: copyS3Mock, deleteStorageFileS3: deleteS3Mock }))
vi.mock('@/server/bunny/stream.js', () => ({ deleteStreamVideo: deleteVideoMock }))
vi.mock('@/server/bunny/cdn.js', () => ({ purgeCache: purgeMock }))

const { getCopyFile, getDeleteFile } = await import('@/server/payload/storage/fileOperations.js')

import { buildContext as buildBaseContext, storageOptions, streamOptions } from '../../../../helpers/unit/context.js'

const buildContext = (overrides: Record<string, unknown> = {}) =>
  buildBaseContext({ storageOptions, streamOptions, ...overrides })

const options = { collections: new Map([['media', { stream: { libraryId: 12345 } }]]) } as never

const resolveStorageKey = ({ _objectKey, filename, prefix }: Record<string, string | undefined>) =>
  [prefix, _objectKey, filename].filter(Boolean).join('/')

type DbMock = ReturnType<typeof vi.fn>

const buildReq = ({
  find = vi.fn(async () => ({ docs: [] })),
  findOne = vi.fn(async () => null),
  findVersions = vi.fn(async () => ({ docs: [] })),
  versions = { maxPerDoc: 0 },
}: { find?: DbMock; findOne?: DbMock; findVersions?: DbMock; versions?: false | { maxPerDoc: number } } = {}) => ({
  context: {} as Record<string, unknown>,
  payload: {
    collections: { media: { config: { slug: 'media', upload: { fileOperations: { resolveStorageKey } }, versions } } },
    db: { find, findOne, findVersions },
    logger: { debug: vi.fn(), error: vi.fn() },
  },
})

const videoDoc = (videoId: string, _objectKey: string) => ({
  _objectKey,
  bunnyData: { stream: { videoId } },
  filename: 'clip-original.mp4',
  original: { _objectKey, filename: 'clip-original.mp4', prefix: 'media' },
  prefix: 'media',
})

describe('copyFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('copies a Storage file over HTTP within the zone', async () => {
    const req = buildReq()

    await getCopyFile(buildContext({ streamOptions: undefined }))({
      from: 'media/a/photo.jpg',
      req,
      to: 'media/b/photo.jpg',
    } as never)

    expect(copyMock).toHaveBeenCalledWith({
      apiKey: 'storage-key',
      from: 'media/a/photo.jpg',
      region: 'de',
      timeout: 60000,
      to: 'media/b/photo.jpg',
      zoneName: 'my-zone',
    })
    expect(req.payload.db.find).not.toHaveBeenCalled()
  })

  it('copies a Storage file with S3 CopyObject when S3 is on', async () => {
    await getCopyFile(buildContext({ storageOptions: { ...storageOptions, s3: true } as never }))({
      from: 'media/a/photo.jpg',
      req: buildReq(),
      to: 'media/b/photo.jpg',
    } as never)

    expect(copyS3Mock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'media/a/photo.jpg', to: 'media/b/photo.jpg' }),
    )
    expect(copyMock).not.toHaveBeenCalled()
  })

  it('passes the EEXIST error of an existing target to Payload', async () => {
    copyMock.mockRejectedValueOnce(Object.assign(new Error('Storage destination already exists'), { code: 'EEXIST' }))

    await expect(
      getCopyFile(buildContext())({ from: 'media/a/photo.jpg', req: buildReq(), to: 'media/b/photo.jpg' } as never),
    ).rejects.toMatchObject({ code: 'EEXIST' })
  })

  it('maps the target key to the video of a Stream file without copying anything', async () => {
    const doc = videoDoc('v-1', 'a')
    const find = vi.fn(async () => ({ docs: [doc] }))
    const req = buildReq({ find, versions: false })
    const deleteFile = getDeleteFile(buildContext(), options)

    await getCopyFile(buildContext())({
      from: 'media/a/clip-original.mp4',
      req,
      to: 'media/b/clip-original.mp4',
    } as never)
    await deleteFile({ req, storageFilePath: 'media/b/clip-original.mp4' } as never)

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          or: [{ filename: { equals: 'clip-original.mp4' } }, { 'original.filename': { equals: 'clip-original.mp4' } }],
        },
      }),
    )
    expect(copyMock).not.toHaveBeenCalled()
    expect(copyS3Mock).not.toHaveBeenCalled()
    expect(deleteVideoMock).toHaveBeenCalledWith({ apiKey: 'stream-key', libraryId: 12345, videoId: 'v-1' })
  })

  it('finds the video of a Stream file that only a version stores', async () => {
    const findVersions = vi.fn(async () => ({ docs: [{ version: videoDoc('v-old', 'a') }] }))
    const req = buildReq({ findVersions, versions: { maxPerDoc: 10 } })

    await getCopyFile(buildContext())({
      from: 'media/a/clip-original.mp4',
      req,
      to: 'media/c/clip-original.mp4',
    } as never)

    expect(findVersions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          or: [
            { 'version.filename': { equals: 'clip-original.mp4' } },
            { 'version.original.filename': { equals: 'clip-original.mp4' } },
          ],
        },
      }),
    )
    expect(copyMock).not.toHaveBeenCalled()
  })
})

describe('deleteFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes a Storage file and purges its plain CDN URL', async () => {
    const context = buildContext({ accountApiKey: 'account', purgeOptions: { async: false } } as never)

    await getDeleteFile(context, options)({ req: buildReq(), storageFilePath: 'media/a/photo.jpg' } as never)

    expect(deleteMock).toHaveBeenCalledWith({
      apiKey: 'storage-key',
      path: 'media/a/photo.jpg',
      region: 'de',
      zoneName: 'my-zone',
    })
    expect(purgeMock).toHaveBeenCalledWith({
      apiKey: 'account',
      async: false,
      url: 'https://storage.b-cdn.net/media/a/photo.jpg*',
    })
  })

  it('does not purge without purge options', async () => {
    await getDeleteFile(buildContext(), options)({ req: buildReq(), storageFilePath: 'media/a/photo.jpg' } as never)

    expect(deleteMock).toHaveBeenCalled()
    expect(purgeMock).not.toHaveBeenCalled()
  })

  it('deletes with S3 when S3 is on', async () => {
    const context = buildContext({ storageOptions: { ...storageOptions, s3: true } as never })

    await getDeleteFile(context, options)({ req: buildReq(), storageFilePath: 'media/a/photo.jpg' } as never)

    expect(deleteS3Mock).toHaveBeenCalledWith(expect.objectContaining({ path: 'media/a/photo.jpg' }))
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('logs a failed purge without throwing', async () => {
    purgeMock.mockRejectedValueOnce(new Error('purge failed'))
    const context = buildContext({ accountApiKey: 'account', purgeOptions: { async: false } } as never)
    const req = buildReq()

    await expect(
      getDeleteFile(context, options)({ req, storageFilePath: 'media/a/photo.jpg' } as never),
    ).resolves.toBeUndefined()
    expect(req.payload.logger.error).toHaveBeenCalled()
  })

  it('keeps a video that a document still uses', async () => {
    const req = buildReq({ findOne: vi.fn(async () => ({ id: 'doc-2' })), versions: false })
    req.context.bunnyStreamKeys = new Map([['media', new Map([['media/a/clip-original.mp4', 'v-1']])]])

    await getDeleteFile(buildContext(), options)({ req, storageFilePath: 'media/a/clip-original.mp4' } as never)

    expect(deleteVideoMock).not.toHaveBeenCalled()
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('keeps a video that a version still uses', async () => {
    const findVersions = vi.fn(async () => ({ docs: [{ id: 'version-1' }] }))
    const req = buildReq({ findVersions, versions: { maxPerDoc: 10 } })
    req.context.bunnyStreamKeys = new Map([['media', new Map([['media/a/clip-original.mp4', 'v-1']])]])

    await getDeleteFile(buildContext(), options)({ req, storageFilePath: 'media/a/clip-original.mp4' } as never)

    expect(findVersions).toHaveBeenCalledWith(
      expect.objectContaining({ where: { 'version.bunnyData.stream.videoId': { equals: 'v-1' } } }),
    )
    expect(deleteVideoMock).not.toHaveBeenCalled()
  })

  it('deletes a video that nothing uses any more', async () => {
    const req = buildReq({ versions: { maxPerDoc: 10 } })
    req.context.bunnyStreamKeys = new Map([['media', new Map([['media/a/clip-original.mp4', 'v-1']])]])

    await getDeleteFile(buildContext(), options)({ req, storageFilePath: 'media/a/clip-original.mp4' } as never)

    expect(deleteVideoMock).toHaveBeenCalledWith({ apiKey: 'stream-key', libraryId: 12345, videoId: 'v-1' })
    expect(deleteMock).not.toHaveBeenCalled()
  })
})

describe('deleteFile without a remembered key', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('finds the video of a Stream key in the database and deletes it when nothing uses it', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({ docs: [videoDoc('v-1', 'a')] })
      .mockResolvedValue({ docs: [] })
    const req = buildReq({ find, versions: false })

    await getDeleteFile(buildContext(), options)({ req, storageFilePath: 'media/a/clip-original.mp4' } as never)

    expect(deleteVideoMock).toHaveBeenCalledWith({ apiKey: 'stream-key', libraryId: 12345, videoId: 'v-1' })
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('keeps the remembered keys of one collection apart from another', async () => {
    const req = buildReq({ versions: false })
    req.context.bunnyStreamKeys = new Map([['other', new Map([['media/a/clip-original.mp4', 'v-other']])]])

    await getDeleteFile(buildContext(), options)({ req, storageFilePath: 'media/a/clip-original.mp4' } as never)

    expect(deleteVideoMock).not.toHaveBeenCalled()
    expect(deleteMock).toHaveBeenCalledWith(expect.objectContaining({ path: 'media/a/clip-original.mp4' }))
  })
})
