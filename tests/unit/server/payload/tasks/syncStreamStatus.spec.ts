import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { checkSizeMock, getVideoMock, listVideosMock, readyResolutionsMock, writeMock } = vi.hoisted(() => ({
  checkSizeMock: vi.fn(),
  getVideoMock: vi.fn(),
  listVideosMock: vi.fn(),
  readyResolutionsMock: vi.fn(),
  writeMock: vi.fn(),
}))

vi.mock('@/server/bunny/stream.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/bunny/stream.js')>()
  return {
    ...actual,
    getReadyResolutions: readyResolutionsMock,
    getStreamVideo: getVideoMock,
    listStreamVideos: listVideosMock,
  }
})

vi.mock('@/server/payload/stream/storedStream.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/payload/stream/storedStream.js')>()),
  checkStreamOriginalSize: checkSizeMock,
  writeStoredStream: writeMock,
}))

const { BunnyStreamVideoStatus } = await import('@/server/bunny/stream.js')
const { createNormalizedOptions } = await import('@/server/payload/options/normalizer.js')
const { getStreamStatusSyncTask } = await import('@/server/payload/tasks/jobs.js')
const { syncStreamStatus } = await import('@/server/payload/tasks/syncStreamStatus.js')
const { PLUGIN_KEY } = await import('@/shared/constants.js')

const { httpError } = await import('../../../../helpers/unit/httpError.js')
const { createOwnStream } = await import('../../../../helpers/unit/optionsBuilders.js')

const wrapped = (status: number) => new Error(`HTTP ${status}`, { cause: httpError(status) })

const buildOptions = (sync: unknown = true, mp4Fallback = false) =>
  createNormalizedOptions({
    collections: {
      off: { disablePayloadAccessControl: true, stream: createOwnStream(333) },
      videos: { disablePayloadAccessControl: true, stream: createOwnStream(111, { mp4Fallback, status: { sync } }) },
    },
  } as never)

const docsFor = (count: number, from = 0, updatedAt?: string) =>
  Array.from({ length: count }, (_, offset) => {
    const index = from + offset
    return {
      id: `doc-${index}`,
      bunnyData: { stream: { resolutions: { available: ['720p'] }, status: 'processing', videoId: `v-${index}` } },
      updatedAt: updatedAt ?? new Date(Date.UTC(2026, 0, 1, 0, 0, 1000 - index)).toISOString(),
    }
  })

const buildPayload = (options: unknown, docs: unknown[], ...pages: unknown[][]) => {
  const find = vi.fn().mockResolvedValue({ docs: [] })
  for (const page of [docs, ...pages]) {
    find.mockResolvedValueOnce({ docs: page })
  }
  const logger = { error: vi.fn(), warn: vi.fn() }
  const payload = {
    collections: { videos: { config: { timestamps: true } } },
    config: { custom: { [PLUGIN_KEY]: { config: options } } },
    find,
    logger,
  }
  return { find, logger, payload: payload as never, req: { payload } as never }
}

describe('syncStreamStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVideoMock.mockResolvedValue({ status: BunnyStreamVideoStatus.Finished })
    listVideosMock.mockResolvedValue({ items: [] })
    readyResolutionsMock.mockImplementation(async ({ resolutions }) => resolutions)
    writeMock.mockResolvedValue(true)
  })

  it('checks the size of the original file of each video that became ready', async () => {
    getVideoMock.mockImplementation(async ({ videoId }: { videoId: string }) => ({
      status: videoId === 'v-2' ? BunnyStreamVideoStatus.Processing : BunnyStreamVideoStatus.Finished,
    }))
    const docs = docsFor(3).map((doc) => ({ ...doc, filesize: 1000 }))
    const { payload, req } = buildPayload(buildOptions(), docs)

    await syncStreamStatus({ payload, req })

    expect(checkSizeMock.mock.calls.map(([{ videoId }]) => videoId)).toEqual(['v-0', 'v-1'])
    expect(checkSizeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'own-stream-key-111',
        collection: 'videos',
        doc: docs[0],
        libraryId: 111,
        videoId: 'v-0',
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('queries recent processing documents and videos with no status of collections with the status sync, last saved first', async () => {
    const { find, payload, req } = buildPayload(buildOptions({ limit: 7, maxAge: 60 }), [])
    const before = Date.now()

    expect(await syncStreamStatus({ payload, req })).toEqual({ checked: 0, failed: 0, hasMore: false, updated: 0 })

    expect(find).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        collection: 'videos',
        depth: 0,
        limit: 7,
        overrideAccess: true,
        pagination: false,
        select: { bunnyData: true, filesize: true, updatedAt: true },
        sort: ['-updatedAt', '-id'],
      }),
    )
    const { and } = find.mock.calls[0]![0].where
    expect(and).toHaveLength(1)
    const [recent, missing] = and[0].or
    const [processing, saved] = recent.and
    expect(processing).toEqual({ 'bunnyData.stream.status': { equals: 'processing' } })
    const cutoff = new Date(saved.updatedAt.greater_than).getTime()
    expect(cutoff).toBeGreaterThanOrEqual(before - 60_000)
    expect(cutoff).toBeLessThanOrEqual(Date.now() - 60_000)
    expect(missing).toEqual({
      and: [{ 'bunnyData.stream.status': { exists: false } }, { 'bunnyData.stream.videoId': { exists: true } }],
    })
  })

  it.each([
    ['the Bunny state', BunnyStreamVideoStatus.Finished, 'ready', {}, 1],
    ['processing while Bunny still encodes', BunnyStreamVideoStatus.Processing, 'processing', { status: null }, 0],
  ])(
    'stores %s for a video with no stored status, only while the status is still empty',
    async (_, status, stored, storedStatus, sizeChecks) => {
      getVideoMock.mockResolvedValue({ status })
      const doc = {
        id: 'old',
        bunnyData: { stream: { ...storedStatus, videoId: 'v-old' } },
        filesize: 1000,
        updatedAt: '2020-01-01T00:00:00.000Z',
      }
      const { payload, req } = buildPayload(buildOptions(), [doc])

      expect(await syncStreamStatus({ payload, req })).toEqual({ checked: 1, failed: 0, hasMore: false, updated: 1 })
      expect(writeMock).toHaveBeenCalledExactlyOnceWith({
        collection: 'videos',
        id: 'old',
        req,
        stream: { resolutions: undefined, status: stored, videoId: 'v-old' },
        whenStatus: null,
      })
      expect(checkSizeMock).toHaveBeenCalledTimes(sizeChecks)
    },
  )

  it('counts an error for a video with no stored status as failed and keeps the status empty', async () => {
    getVideoMock.mockRejectedValue(wrapped(500))
    const doc = { id: 'old', bunnyData: { stream: { videoId: 'v-old' } }, updatedAt: '2020-01-01T00:00:00.000Z' }
    const { logger, payload, req } = buildPayload(buildOptions(), [doc])

    expect(await syncStreamStatus({ payload, req })).toEqual({ checked: 0, failed: 1, hasMore: false, updated: 0 })
    expect(writeMock).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalled()
  })

  it('stores processing for a video with no stored status while mp4Fallback is on and Bunny has no MP4 resolutions yet', async () => {
    readyResolutionsMock.mockResolvedValue(undefined)
    const doc = { id: 'old', bunnyData: { stream: { videoId: 'v-old' } }, updatedAt: '2020-01-01T00:00:00.000Z' }
    const { payload, req } = buildPayload(buildOptions(true, true), [doc])

    expect(await syncStreamStatus({ payload, req })).toMatchObject({ checked: 1, updated: 1 })
    expect(writeMock.mock.calls[0]![0]).toMatchObject({ stream: { status: 'processing' }, whenStatus: null })
  })

  it('stores failed for a video with no stored status that Bunny no longer has', async () => {
    getVideoMock.mockRejectedValue(wrapped(404))
    const doc = { id: 'old', bunnyData: { stream: { videoId: 'v-old' } }, updatedAt: '2020-01-01T00:00:00.000Z' }
    const { payload, req } = buildPayload(buildOptions(), [doc])

    expect(await syncStreamStatus({ payload, req })).toMatchObject({ checked: 1, updated: 1 })
    expect(writeMock.mock.calls[0]![0]).toMatchObject({ stream: { status: 'failed' }, whenStatus: null })
  })

  it('stores a changed state only while the stored status is still processing and keeps the resolutions', async () => {
    getVideoMock.mockImplementation(async ({ videoId }: { videoId: string }) => ({
      status: videoId === 'v-0' ? BunnyStreamVideoStatus.Finished : BunnyStreamVideoStatus.Processing,
    }))
    const { payload, req } = buildPayload(buildOptions(), docsFor(2))

    expect(await syncStreamStatus({ payload, req })).toEqual({ checked: 2, failed: 0, hasMore: false, updated: 1 })

    expect(getVideoMock).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'own-stream-key-111', libraryId: 111 }))
    expect(writeMock).toHaveBeenCalledExactlyOnceWith({
      collection: 'videos',
      id: 'doc-0',
      req,
      stream: { resolutions: { available: ['720p'] }, status: 'ready', videoId: 'v-0' },
      whenStatus: 'processing',
    })
  })

  it('fills missing resolutions in the same write when a video becomes ready and mp4Fallback is on', async () => {
    const resolutions = { available: ['1080p', '720p'], highest: '1080p' }
    readyResolutionsMock.mockResolvedValue(resolutions)
    const { payload, req } = buildPayload(buildOptions(true, true), docsFor(1))

    expect(await syncStreamStatus({ payload, req })).toMatchObject({ checked: 1, updated: 1 })
    expect(readyResolutionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'own-stream-key-111',
        encoded: true,
        libraryId: 111,
        mp4Fallback: true,
        resolutions: { available: ['720p'] },
        videoId: 'v-0',
      }),
    )
    expect(writeMock.mock.calls[0]![0].stream).toEqual({ resolutions, status: 'ready', videoId: 'v-0' })
  })

  it('leaves an encoded video processing while mp4Fallback is on and Bunny has no MP4 resolutions yet', async () => {
    readyResolutionsMock.mockResolvedValue(undefined)
    const { payload, req } = buildPayload(buildOptions(true, true), docsFor(1))

    expect(await syncStreamStatus({ payload, req })).toEqual({ checked: 1, failed: 0, hasMore: false, updated: 0 })
    expect(writeMock).not.toHaveBeenCalled()
  })

  it('writes one document at a time', async () => {
    const { payload, req } = buildPayload(buildOptions(), docsFor(8))
    let running = 0
    let most = 0
    writeMock.mockImplementation(async () => {
      running++
      most = Math.max(most, running)
      await new Promise((resolve) => setTimeout(resolve, 1))
      running--
      return true
    })

    expect(await syncStreamStatus({ payload, req })).toMatchObject({ checked: 8, updated: 8 })
    expect(most).toBe(1)
  })

  it('counts only writes that matched a document', async () => {
    const { payload, req } = buildPayload(buildOptions(), docsFor(2))
    writeMock.mockResolvedValueOnce(false)

    expect(await syncStreamStatus({ payload, req })).toEqual({ checked: 2, failed: 0, hasMore: false, updated: 1 })
    expect(writeMock).toHaveBeenCalledTimes(2)
  })

  it('stores failed for a video Bunny no longer has while the library answers', async () => {
    getVideoMock.mockRejectedValue(wrapped(404))
    const { payload, req } = buildPayload(buildOptions(), docsFor(1))

    expect(await syncStreamStatus({ payload, req })).toEqual({ checked: 1, failed: 0, hasMore: false, updated: 1 })
    expect(writeMock.mock.calls[0]![0].stream.status).toBe('failed')
  })

  it('counts a 404 as failed and writes nothing when the library does not answer', async () => {
    getVideoMock.mockRejectedValue(wrapped(404))
    listVideosMock.mockRejectedValue(wrapped(401))
    const { logger, payload, req } = buildPayload(buildOptions(), docsFor(1))

    expect(await syncStreamStatus({ payload, req })).toEqual({ checked: 0, failed: 1, hasMore: false, updated: 0 })
    expect(writeMock).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalled()
  })

  it.each([
    ['the video request', false, getVideoMock, { checked: 0, failed: 0, hasMore: true, updated: 0 }],
    ['the resolutions request', true, readyResolutionsMock, { failed: 0, hasMore: true, updated: 0 }],
  ])(
    'stops on a 429 from %s, reports hasMore and leaves the document processing',
    async (_, mp4Fallback, source, result) => {
      source.mockRejectedValue(wrapped(429))
      const { logger, payload, req } = buildPayload(buildOptions(true, mp4Fallback), docsFor(10))

      expect(await syncStreamStatus({ payload, req })).toMatchObject(result)
      expect(source.mock.calls.length).toBeLessThanOrEqual(4)
      expect(writeMock).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalled()
    },
  )

  it('loads the next page after a full one and reports no hasMore once every document is checked', async () => {
    const { find, payload, req } = buildPayload(buildOptions(), docsFor(3), docsFor(3, 3), docsFor(1, 6))

    expect(await syncStreamStatus({ limit: 3, payload, req })).toEqual({
      checked: 7,
      failed: 0,
      hasMore: false,
      updated: 7,
    })
    expect(find).toHaveBeenCalledTimes(3)
    expect(find.mock.calls[0]![0].where.and).toHaveLength(1)
    const lastUpdatedAt = docsFor(1, 2)[0]!.updatedAt
    expect(find.mock.calls[1]![0].where.and.slice(1)).toEqual([
      {
        or: [
          { updatedAt: { less_than: lastUpdatedAt } },
          { and: [{ updatedAt: { equals: lastUpdatedAt } }, { id: { less_than: 'doc-2' } }] },
        ],
      },
    ])
  })

  it('checks one more page when the last page is exactly full', async () => {
    const { find, payload, req } = buildPayload(buildOptions(), docsFor(2))

    expect(await syncStreamStatus({ limit: 2, payload, req })).toMatchObject({ checked: 2, hasMore: false })
    expect(find).toHaveBeenCalledTimes(2)
  })

  it('pages through a shared updatedAt by the last id only', async () => {
    const updatedAt = '2026-01-01T00:00:00.000Z'
    const { find, payload, req } = buildPayload(
      buildOptions(),
      docsFor(2, 0, updatedAt),
      docsFor(2, 2, updatedAt),
      docsFor(1, 4, updatedAt),
    )

    expect(await syncStreamStatus({ limit: 2, payload, req })).toMatchObject({ checked: 5, hasMore: false })
    expect(find.mock.calls[2]![0].where.and.slice(1)).toEqual([
      {
        or: [
          { updatedAt: { less_than: updatedAt } },
          { and: [{ updatedAt: { equals: updatedAt } }, { id: { less_than: 'doc-3' } }] },
        ],
      },
    ])
  })

  it('stops between pages at the deadline and reports hasMore', async () => {
    const { payload, req } = buildPayload(buildOptions(), docsFor(2), docsFor(2, 2))
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now')
    clock.mockReturnValue(now)
    getVideoMock.mockImplementation(async () => {
      clock.mockReturnValue(now + 30_000)
      return { status: BunnyStreamVideoStatus.Finished }
    })

    expect(await syncStreamStatus({ limit: 2, payload, req })).toEqual({
      checked: 1,
      failed: 0,
      hasMore: true,
      updated: 1,
    })
  })

  it('does not count a call cut by the deadline as failed and reports hasMore', async () => {
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    getVideoMock.mockImplementation(async () => {
      clock.mockReturnValue(now + 25_000)
      throw new Error('Request timed out')
    })
    const { logger, payload, req } = buildPayload(buildOptions(), docsFor(3))

    expect(await syncStreamStatus({ payload, req })).toEqual({ checked: 0, failed: 0, hasMore: true, updated: 0 })
    expect(getVideoMock).toHaveBeenCalledTimes(1)
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('does not start a document with less than two seconds left', async () => {
    const { find, payload, req } = buildPayload(buildOptions(), docsFor(1))

    expect(await syncStreamStatus({ maxDurationMs: 1_999, payload, req })).toEqual({
      checked: 0,
      failed: 0,
      hasMore: true,
      updated: 0,
    })
    expect(find).not.toHaveBeenCalled()
    expect(getVideoMock).not.toHaveBeenCalled()
  })

  it.each([
    ['Payload does not have it', {}],
    ['it has no timestamps', { videos: { config: { timestamps: false } } }],
  ])('skips a collection with a warning when %s', async (_, collections) => {
    const { find, logger, payload, req } = buildPayload(buildOptions(), docsFor(1))
    ;(payload as { collections: unknown }).collections = collections

    expect(await syncStreamStatus({ payload, req })).toEqual({ checked: 0, failed: 0, hasMore: false, updated: 0 })
    expect(find).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith({ msg: expect.stringContaining('"videos"') })
  })

  it.each([
    ['ends at the deadline', 5_000, 4_000, 5_000, 1_000],
    ['is capped at the default timeout', undefined, 0, 15_000, 15_000],
  ])(
    'gives each Bunny call a timeout that %s',
    async (_label, maxDurationMs, elapsed, videoTimeout, resolutionsTimeout) => {
      const now = Date.now()
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
      getVideoMock.mockImplementation(async () => {
        clock.mockReturnValue(now + elapsed)
        return { status: BunnyStreamVideoStatus.Finished }
      })
      const { payload, req } = buildPayload(buildOptions(true, true), docsFor(1))

      await syncStreamStatus({ maxDurationMs, payload, req })

      expect(getVideoMock).toHaveBeenCalledWith(expect.objectContaining({ timeout: videoTimeout }))
      expect(readyResolutionsMock).toHaveBeenCalledWith(expect.objectContaining({ timeout: resolutionsTimeout }))
    },
  )

  it('throws when the plugin is not configured or no collection turns on the status sync', async () => {
    await expect(syncStreamStatus({ payload: buildPayload(undefined, []).payload })).rejects.toThrow(
      'the storage-bunny plugin is not configured',
    )
    await expect(syncStreamStatus({ payload: buildPayload(buildOptions(false), []).payload })).rejects.toThrow(
      'no collection turns on `stream.status.sync`',
    )
  })

  it('runs from the Payload task handler', async () => {
    const options = buildOptions()
    const { find, req } = buildPayload(options, [])
    const handler = getStreamStatusSyncTask(options)!.handler as unknown as (args: {
      req: never
    }) => Promise<{ output: unknown }>

    expect(await handler({ req })).toEqual({ output: {} })
    expect(find).toHaveBeenCalled()
  })
})
