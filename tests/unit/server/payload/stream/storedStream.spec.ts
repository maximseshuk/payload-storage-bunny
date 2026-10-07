import { beforeEach, describe, expect, it, vi } from 'vitest'

const { originalSizeMock } = vi.hoisted(() => ({ originalSizeMock: vi.fn() }))

vi.mock('@/server/bunny/stream.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/bunny/stream.js')>()),
  getStreamVideoOriginalSize: originalSizeMock,
}))

const { checkStreamOriginalSize, writeStoredStream } = await import('@/server/payload/stream/storedStream.js')

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
