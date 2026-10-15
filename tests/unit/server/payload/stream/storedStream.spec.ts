import { beforeEach, describe, expect, it, vi } from 'vitest'

const { originalSizeMock } = vi.hoisted(() => ({ originalSizeMock: vi.fn() }))

vi.mock('@/server/bunny/stream.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/bunny/stream.js')>()),
  getStreamVideoOriginalSize: originalSizeMock,
}))

const { checkStreamOriginalSize, findStreamVersion, writeStoredStream, writeStoredVersionStream } =
  await import('@/server/payload/stream/storedStream.js')

const resolutions = { available: ['720p'], highest: '720p' }

const write = async (
  args: Partial<Parameters<typeof writeStoredStream>[0]>,
  stored: unknown = { id: 'doc-1', bunnyData: { stream: { status: 'processing', videoId: 'v-1' } } },
  updated: unknown = { id: 'doc-1' },
) => {
  const findOne = vi.fn().mockResolvedValue(stored)
  const updateOne = vi.fn().mockResolvedValue(updated)
  const req = { payload: { db: { findOne, updateOne } } } as never
  const written = await writeStoredStream({
    collection: 'media',
    id: 'doc-1',
    req,
    stream: { videoId: 'v-1' },
    ...args,
  })
  return { findOne, req, updateOne, written }
}

const videoWhere = (...extra: unknown[]) => ({
  and: [{ id: { equals: 'doc-1' } }, { 'bunnyData.stream.videoId': { equals: 'v-1' } }, ...extra],
})

describe('writeStoredStream', () => {
  it('reads and writes the document only while it still has the video, without touching updatedAt', async () => {
    const { findOne, req, updateOne, written } = await write({
      stream: { resolutions, status: 'ready', videoId: 'v-1' },
    })

    expect(written).toBe(true)
    expect(findOne).toHaveBeenCalledExactlyOnceWith({ collection: 'media', req, where: videoWhere() })
    expect(updateOne).toHaveBeenCalledExactlyOnceWith({
      collection: 'media',
      data: { bunnyData: { stream: { resolutions, status: 'ready', videoId: 'v-1' } }, updatedAt: null },
      req,
      select: { id: true },
      where: videoWhere(),
    })
  })

  it.each([
    ['undefined', undefined, []],
    ['null', null, [{ 'bunnyData.stream.status': { exists: false } }]],
    ['a state', 'processing', [{ 'bunnyData.stream.status': { equals: 'processing' } }]],
  ] as const)('guards the stored status when whenStatus is %s', async (_label, whenStatus, extra) => {
    const { findOne, updateOne } = await write({ stream: { status: 'ready', videoId: 'v-1' }, whenStatus })

    expect(findOne.mock.calls[0]![0].where).toEqual(videoWhere(...extra))
    expect(updateOne.mock.calls[0]![0].where).toEqual(videoWhere(...extra))
  })

  it.each([
    ['keeps the stored resolutions and status when the stream brings none', {}, { resolutions, status: 'ready' }],
    [
      'writes the resolutions and status of the stream over the stored ones',
      { resolutions: { available: ['1080p'], highest: '1080p' }, status: 'failed' as const },
      { resolutions: { available: ['1080p'], highest: '1080p' }, status: 'failed' },
    ],
  ])('%s', async (_label, stream, expected) => {
    const { updateOne } = await write(
      { stream: { ...stream, videoId: 'v-1' } },
      { id: 'doc-1', bunnyData: { stream: { resolutions, status: 'ready', videoId: 'v-1' } } },
    )

    expect(updateOne.mock.calls[0]![0].data.bunnyData.stream).toEqual({ ...expected, videoId: 'v-1' })
  })

  it('writes only the video ID when neither the stream nor the document has resolutions or a status', async () => {
    const { updateOne } = await write({}, { id: 'doc-1', bunnyData: { stream: { videoId: 'v-1' } } })

    expect(updateOne.mock.calls[0]![0].data.bunnyData.stream).toEqual({ videoId: 'v-1' })
  })

  it.each([
    ['no document matches', null, { id: 'doc-1' }, 0],
    ['the matching document has no Stream data', { id: 'doc-1' }, { id: 'doc-1' }, 0],
    ['the write matches no document', undefined, null, 1],
  ])('returns false when %s', async (_label, stored, updated, writes) => {
    const { updateOne, written } = await write({}, stored, updated)

    expect(written).toBe(false)
    expect(updateOne).toHaveBeenCalledTimes(writes)
  })
})

const versionRow = (stream: Record<string, unknown> = { status: 'processing', videoId: 'v-1' }) => ({
  id: 'ver-1',
  autosave: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  latest: true,
  parent: 'doc-1',
  updatedAt: '2026-01-02T00:00:00.000Z',
  version: { _status: 'draft', bunnyData: { stream }, filename: 'clip.mp4', title: 'Draft' },
})

const writeVersion = async (
  args: Partial<Parameters<typeof writeStoredVersionStream>[0]>,
  row: unknown = versionRow(),
  updated: unknown = { id: 'ver-1' },
) => {
  const findVersions = vi.fn().mockResolvedValue({ docs: row ? [row] : [] })
  const updateVersion = vi.fn().mockResolvedValue(updated)
  const req = { payload: { db: { findVersions, updateVersion } } } as never
  const written = await writeStoredVersionStream({
    collection: 'media',
    id: 'ver-1',
    req,
    stream: { videoId: 'v-1' },
    ...args,
  })
  return { findVersions, req, updateVersion, written }
}

const versionWhere = (...extra: unknown[]) => [
  { id: { equals: 'ver-1' } },
  { 'version.bunnyData.stream.videoId': { equals: 'v-1' } },
  ...extra,
]

const latestGuard = { latest: { equals: true } }

describe('writeStoredVersionStream', () => {
  it.each([
    ['false', false],
    ['missing', undefined],
    ['null', null],
  ])('guards a version that is not the latest when latest is %s', async (_label, latest) => {
    const { updateVersion } = await writeVersion(
      { stream: { status: 'ready', videoId: 'v-1' } },
      { ...versionRow(), latest },
    )

    expect(updateVersion.mock.calls[0]![0].versionData.latest).toBe(latest)
    expect(updateVersion.mock.calls[0]![0].where.and.at(-1)).toEqual({
      or: [{ latest: { equals: false } }, { latest: { exists: false } }],
    })
  })

  it('writes the whole version back with only the stream changed and the same updatedAt', async () => {
    const { findVersions, req, updateVersion, written } = await writeVersion({
      stream: { resolutions, status: 'ready', videoId: 'v-1' },
    })

    expect(written).toBe(true)
    expect(findVersions).toHaveBeenCalledExactlyOnceWith({
      collection: 'media',
      limit: 1,
      pagination: false,
      req,
      where: { and: versionWhere() },
    })
    expect(updateVersion).toHaveBeenCalledExactlyOnceWith({
      id: 'ver-1',
      collection: 'media',
      req,
      select: { id: true },
      versionData: {
        createdAt: '2026-01-01T00:00:00.000Z',
        latest: true,
        parent: 'doc-1',
        publishedLocale: undefined,
        updatedAt: '2026-01-02T00:00:00.000Z',
        version: {
          _status: 'draft',
          bunnyData: { stream: { resolutions, status: 'ready', videoId: 'v-1' } },
          filename: 'clip.mp4',
          title: 'Draft',
        },
      },
      where: { and: versionWhere({ updatedAt: { equals: '2026-01-02T00:00:00.000Z' } }, latestGuard) },
    })
  })

  it.each([
    ['null', null, { 'version.bunnyData.stream.status': { exists: false } }],
    ['a state', 'processing', { 'version.bunnyData.stream.status': { equals: 'processing' } }],
  ] as const)('guards the stored status of the version when whenStatus is %s', async (_label, whenStatus, guard) => {
    const { findVersions, updateVersion } = await writeVersion({
      stream: { status: 'ready', videoId: 'v-1' },
      whenStatus,
    })

    expect(findVersions.mock.calls[0]![0].where).toEqual({ and: versionWhere(guard) })
    expect(updateVersion.mock.calls[0]![0].where).toEqual({
      and: versionWhere(guard, { updatedAt: { equals: '2026-01-02T00:00:00.000Z' } }, latestGuard),
    })
  })

  it('keeps the stored resolutions and status when the stream brings none', async () => {
    const { updateVersion } = await writeVersion({}, versionRow({ resolutions, status: 'ready', videoId: 'v-1' }))

    expect(updateVersion.mock.calls[0]![0].versionData.version.bunnyData.stream).toEqual({
      resolutions,
      status: 'ready',
      videoId: 'v-1',
    })
  })

  it.each([
    ['no version matches, for example after a newer state was stored', null, { id: 'ver-1' }, 0],
    ['the write matches no version three times in a row', undefined, null, 3],
  ])('returns false when %s', async (_label, row, updated, writes) => {
    const { findVersions, updateVersion, written } = await writeVersion({ whenStatus: 'processing' }, row, updated)

    expect(written).toBe(false)
    expect(updateVersion).toHaveBeenCalledTimes(writes)
    expect(findVersions).toHaveBeenCalledTimes(Math.max(writes, 1))
  })

  it('reads the version again and writes over the fresh row after an autosave changed it', async () => {
    const autosaved = {
      ...versionRow(),
      updatedAt: '2026-01-03T00:00:00.000Z',
      version: { ...versionRow().version, title: 'Autosaved' },
    }
    const findVersions = vi
      .fn()
      .mockResolvedValueOnce({ docs: [versionRow()] })
      .mockResolvedValueOnce({ docs: [autosaved] })
    const updateVersion = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'ver-1' })

    const written = await writeStoredVersionStream({
      collection: 'media',
      id: 'ver-1',
      req: { payload: { db: { findVersions, updateVersion } } } as never,
      stream: { status: 'ready', videoId: 'v-1' },
      whenStatus: 'processing',
    })

    expect(written).toBe(true)
    expect(updateVersion).toHaveBeenCalledTimes(2)
    expect(updateVersion.mock.calls[1]![0]).toMatchObject({
      versionData: {
        updatedAt: '2026-01-03T00:00:00.000Z',
        version: { bunnyData: { stream: { status: 'ready', videoId: 'v-1' } }, title: 'Autosaved' },
      },
      where: {
        and: versionWhere(
          { 'version.bunnyData.stream.status': { equals: 'processing' } },
          { updatedAt: { equals: '2026-01-03T00:00:00.000Z' } },
          latestGuard,
        ),
      },
    })
  })

  it('does not retry when the stored status no longer matches after an autosave', async () => {
    const findVersions = vi
      .fn()
      .mockResolvedValueOnce({ docs: [versionRow()] })
      .mockResolvedValueOnce({ docs: [] })
    const updateVersion = vi.fn().mockResolvedValue(null)

    const written = await writeStoredVersionStream({
      collection: 'media',
      id: 'ver-1',
      req: { payload: { db: { findVersions, updateVersion } } } as never,
      stream: { status: 'ready', videoId: 'v-1' },
      whenStatus: 'processing',
    })

    expect(written).toBe(false)
    expect(findVersions).toHaveBeenCalledTimes(2)
    expect(updateVersion).toHaveBeenCalledOnce()
  })
})

describe('findStreamVersion', () => {
  const byVideo = { and: [{ 'version.bunnyData.stream.videoId': { equals: 'v-1' } }] }
  const draftsReq = (findVersions: unknown) => ({
    payload: { collections: { media: { config: { versions: { drafts: true } } } }, db: { findVersions } },
  })
  const findArgs = (req: unknown, where: unknown) => ({
    collection: 'media',
    limit: 1,
    pagination: false,
    req,
    sort: '-updatedAt',
    where,
  })

  it('finds the latest version with the video in a collection with drafts', async () => {
    const findVersions = vi.fn().mockResolvedValue({ docs: [versionRow()] })
    const req = draftsReq(findVersions)

    expect(await findStreamVersion({ collection: 'media', req: req as never, videoId: 'v-1' })).toEqual(versionRow())
    expect(findVersions).toHaveBeenCalledExactlyOnceWith(
      findArgs(req, { and: [byVideo, { latest: { equals: true } }] }),
    )
  })

  it('falls back to the newest version with the video when the latest version has another video', async () => {
    const older = { ...versionRow(), id: 'ver-0', latest: false }
    const findVersions = vi
      .fn()
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [older] })
    const req = draftsReq(findVersions)

    expect(await findStreamVersion({ collection: 'media', req: req as never, videoId: 'v-1' })).toEqual(older)
    expect(findVersions).toHaveBeenCalledTimes(2)
    expect(findVersions).toHaveBeenLastCalledWith(findArgs(req, byVideo))
  })

  it('returns undefined when no version has the video', async () => {
    const findVersions = vi.fn().mockResolvedValue({ docs: [] })

    expect(
      await findStreamVersion({ collection: 'media', req: draftsReq(findVersions) as never, videoId: 'v-1' }),
    ).toBeUndefined()
    expect(findVersions).toHaveBeenCalledTimes(2)
  })

  it('looks only in the versions of the given document', async () => {
    const findVersions = vi.fn().mockResolvedValue({ docs: [] })
    const req = draftsReq(findVersions)
    const ofDoc = {
      and: [{ 'version.bunnyData.stream.videoId': { equals: 'v-1' } }, { parent: { equals: 'doc-1' } }],
    }

    await findStreamVersion({ collection: 'media', parent: 'doc-1', req: req as never, videoId: 'v-1' })

    expect(findVersions.mock.calls.map(([args]) => args)).toEqual([
      findArgs(req, { and: [ofDoc, { latest: { equals: true } }] }),
      findArgs(req, ofDoc),
    ])
  })

  it.each([
    ['without versions', {}],
    ['with versions but no drafts', { versions: { drafts: false } }],
  ])('does not look in a collection %s', async (_label, config) => {
    const findVersions = vi.fn()
    const req = { payload: { collections: { media: { config } }, db: { findVersions } } }

    expect(await findStreamVersion({ collection: 'media', req: req as never, videoId: 'v-1' })).toBeUndefined()
    expect(findVersions).not.toHaveBeenCalled()
  })
})

const check = async (filesize: unknown) => {
  const logger = { warn: vi.fn() }
  await checkStreamOriginalSize({
    apiKey: 'key',
    collection: 'media',
    doc: { filesize, id: 'doc-1' },
    libraryId: 1,
    logger: logger as never,
    videoId: 'v-1',
  })
  return logger.warn
}

describe('checkStreamOriginalSize', () => {
  beforeEach(() => {
    originalSizeMock.mockReset()
  })

  it('warns with the document and video when the original file in Bunny differs from the stored size', async () => {
    originalSizeMock.mockResolvedValue(999)

    expect(await check(1000)).toHaveBeenCalledExactlyOnceWith({
      collection: 'media',
      docId: 'doc-1',
      filesize: 1000,
      msg: '[bunny:stream] the original file in Bunny Stream does not match the stored file size',
      original: 999,
      videoId: 'v-1',
    })
    expect(originalSizeMock).toHaveBeenCalledWith({ apiKey: 'key', libraryId: 1, videoId: 'v-1' })
  })

  it.each([
    ['the sizes match', 1000, async () => 1000],
    ['Bunny reports no original file', 1000, async () => 0],
    ['the lookup fails', 1000, async () => Promise.reject(new Error('down'))],
  ])('stays silent when %s', async (_label, filesize, original) => {
    originalSizeMock.mockImplementation(original)

    expect(await check(filesize)).not.toHaveBeenCalled()
  })

  it.each([undefined, null, 0])('skips the lookup when the stored size is %s', async (filesize) => {
    expect(await check(filesize)).not.toHaveBeenCalled()
    expect(originalSizeMock).not.toHaveBeenCalled()
  })
})
