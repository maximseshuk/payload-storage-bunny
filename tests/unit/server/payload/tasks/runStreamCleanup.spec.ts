import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteVideoMock, getVideoMock } = vi.hoisted(() => ({
  deleteVideoMock: vi.fn(),
  getVideoMock: vi.fn(),
}))

vi.mock('@/server/bunny/stream.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/bunny/stream.js')>()
  return { ...actual, deleteStreamVideo: deleteVideoMock, getStreamVideo: getVideoMock }
})

const { createNormalizedOptions } = await import('@/server/payload/options/normalizer.js')
const { BunnyStreamVideoStatus } = await import('@/server/bunny/stream.js')
const { getStreamCleanupTask } = await import('@/server/payload/tasks/jobs.js')
const { runStreamCleanup } = await import('@/server/payload/tasks/runStreamCleanup.js')
const { PLUGIN_KEY } = await import('@/shared/constants.js')

const { createBaseStorage, createBaseStream, createOwnStream } =
  await import('../../../../helpers/unit/optionsBuilders.js')

type FindImpl = (args: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>>; totalDocs: number }>

type Options = ReturnType<typeof createNormalizedOptions>

const buildPayload = (options: Options | undefined, find: FindImpl, extras: Record<string, unknown> = {}) =>
  ({
    config: { custom: { [PLUGIN_KEY]: { config: options } } },
    delete: vi.fn().mockResolvedValue({}),
    find,
    logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
    ...extras,
  }) as never

const run = (options: Options, find: FindImpl, extras: Record<string, unknown> = {}, maxDurationMs?: number) => {
  const payload = buildPayload(options, find, extras)
  return runStreamCleanup({ maxDurationMs, payload, req: { payload } as never })
}

const orphanFindImpl: FindImpl = async (args) => {
  if ((args.where as { libraryId?: { not_in?: unknown } }).libraryId?.not_in) {
    return { docs: [{ id: 'orphan-1', videoId: 'vo' }], totalDocs: 1 }
  }
  return { docs: [], totalDocs: 0 }
}

const sessionFindImpl: FindImpl = async (args) => {
  if ((args.where as { libraryId?: { equals?: string } }).libraryId?.equals === '111') {
    return { docs: [{ id: 's-1', videoId: 'v1' }], totalDocs: 1 }
  }
  return { docs: [], totalDocs: 0 }
}

describe('runStreamCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVideoMock.mockResolvedValue({ status: BunnyStreamVideoStatus.Created })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('cleans each library with its own maxAge cutoff and apiKey', async () => {
    const findCalls: Array<Record<string, unknown>> = []
    const find: FindImpl = async (args) => {
      findCalls.push(args)
      const eq = (args.where as { libraryId?: { equals?: string } }).libraryId?.equals
      if (eq === '111') {
        return { docs: [{ id: 's-alpha', videoId: 'va' }], totalDocs: 1 }
      }
      if (eq === '222') {
        return { docs: [{ id: 's-beta', videoId: 'vb' }], totalDocs: 1 }
      }
      return { docs: [], totalDocs: 0 }
    }

    const options = createNormalizedOptions({
      collections: {
        alpha: { disablePayloadAccessControl: true, stream: createOwnStream(111, { cleanup: { maxAge: 100 } }) },
        beta: { disablePayloadAccessControl: true, stream: createOwnStream(222, { cleanup: { maxAge: 10000 } }) },
      },
    } as never)

    await run(options, find)

    expect(getVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'own-stream-key-111', libraryId: 111, videoId: 'va' }),
    )
    expect(getVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'own-stream-key-222', libraryId: 222, videoId: 'vb' }),
    )
    expect(deleteVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'own-stream-key-111', libraryId: 111 }),
    )
    expect(deleteVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'own-stream-key-222', libraryId: 222 }),
    )

    const cutoffOf = (eq: string) => {
      const call = findCalls.find((c) => (c.where as { libraryId?: { equals?: string } }).libraryId?.equals === eq)!
      return new Date((call.where as { createdAt: { less_than: string } }).createdAt.less_than).getTime()
    }
    expect(cutoffOf('111')).toBeGreaterThan(cutoffOf('222'))
  })

  it('deletes orphan sessions for unconfigured libraries and logs a warning', async () => {
    const warn = vi.fn()
    const deleteDoc = vi.fn().mockResolvedValue({})

    const options = createNormalizedOptions({
      collections: { alpha: { disablePayloadAccessControl: true, stream: createOwnStream(111, { cleanup: true }) } },
    } as never)

    const result = await run(options, orphanFindImpl, {
      delete: deleteDoc,
      logger: { debug: vi.fn(), error: vi.fn(), warn },
    })

    expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ id: 'orphan-1' }))
    expect(warn).toHaveBeenCalled()
    expect(result).toEqual({ deletedCount: 1, errorCount: 0, hasMore: false })
  })

  describe('more sessions than one run loads', () => {
    const page = (prefix: string) => Array.from({ length: 100 }, (_, i) => ({ id: `${prefix}-${i}`, videoId: `v${i}` }))
    const options = () =>
      createNormalizedOptions({
        collections: { alpha: { disablePayloadAccessControl: true, stream: createOwnStream(111, { cleanup: true }) } },
      } as never)
    const removedIds = new Set<unknown>()
    const removeDoc = vi.fn(async ({ id }: { id: unknown }) => removedIds.add(id))
    const libraryPage: FindImpl = async (args) => {
      const where = args.where as { id?: { not_in?: unknown[] }; libraryId?: { equals?: string } }
      if (where.libraryId?.equals !== '111') {
        return { docs: [], totalDocs: 0 }
      }
      const left = Array.from({ length: 150 }, (_, i) => ({ id: `s-${i}`, videoId: `v${i}` })).filter(
        ({ id }) => !removedIds.has(id) && !where.id?.not_in?.includes(id),
      )
      return { docs: left.slice(0, 100), totalDocs: left.length }
    }

    beforeEach(() => {
      removedIds.clear()
    })

    it('reports hasMore when a library has more stale sessions than one page', async () => {
      expect(await run(options(), libraryPage, { delete: removeDoc })).toEqual({
        deletedCount: 100,
        errorCount: 0,
        hasMore: true,
      })
    })

    it('loads the next sessions in the same run when sessions of the page keep failing', async () => {
      getVideoMock.mockImplementation(async ({ videoId }: { videoId: string }) => {
        if (Number(videoId.slice(1)) < 100) {
          throw new Error('boom')
        }
        return { status: BunnyStreamVideoStatus.Created }
      })
      expect(await run(options(), libraryPage, { delete: removeDoc })).toEqual({
        deletedCount: 50,
        errorCount: 100,
        hasMore: false,
      })
      expect(removeDoc).toHaveBeenCalledTimes(50)
      expect(removeDoc).not.toHaveBeenCalledWith(expect.objectContaining({ id: 's-0' }))
    })

    it('reports hasMore when there are more orphan sessions than one page', async () => {
      const find: FindImpl = async (args) =>
        (args.where as { libraryId?: { not_in?: unknown } }).libraryId?.not_in
          ? { docs: page('o'), totalDocs: 150 }
          : { docs: [], totalDocs: 0 }

      expect(await run(options(), find)).toEqual({ deletedCount: 100, errorCount: 0, hasMore: true })
    })

    it('does not report hasMore when every session failed', async () => {
      getVideoMock.mockRejectedValue(new Error('boom'))

      expect(await run(options(), libraryPage, { delete: removeDoc })).toEqual({
        deletedCount: 0,
        errorCount: 150,
        hasMore: false,
      })
    })

    it('skips a failed session and cleans the rest of the library in the same run', async () => {
      getVideoMock.mockImplementation(async ({ videoId }: { videoId: string }) => {
        if (videoId === 'v0') {
          throw new Error('boom')
        }
        return { status: BunnyStreamVideoStatus.Created }
      })

      expect(await run(options(), libraryPage, { delete: removeDoc })).toEqual({
        deletedCount: 149,
        errorCount: 1,
        hasMore: false,
      })
    })
  })

  it('drops the session of a video Bunny no longer has without counting an error', async () => {
    getVideoMock.mockRejectedValue(new Error('Bunny Stream: Video not found: v1'))
    const deleteDoc = vi.fn().mockResolvedValue({})
    const options = createNormalizedOptions({
      collections: { alpha: { disablePayloadAccessControl: true, stream: createOwnStream(111, { cleanup: true }) } },
    } as never)

    expect(await run(options, sessionFindImpl, { delete: deleteDoc })).toEqual({
      deletedCount: 0,
      errorCount: 0,
      hasMore: false,
    })
    expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ id: 's-1' }))
  })

  describe('deadline', () => {
    const options = createNormalizedOptions({
      collections: { alpha: { disablePayloadAccessControl: true, stream: createOwnStream(111, { cleanup: true }) } },
    } as never)
    const twoSessions: FindImpl = async (args) =>
      (args.where as { libraryId?: { equals?: string } }).libraryId?.equals === '111'
        ? {
            docs: [
              { id: 's-1', videoId: 'v1' },
              { id: 's-2', videoId: 'v2' },
            ],
            totalDocs: 2,
          }
        : { docs: [], totalDocs: 0 }

    it('gives each Bunny call a timeout that ends at the deadline', async () => {
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)

      await run(options, sessionFindImpl, {}, 5_000)

      expect(getVideoMock).toHaveBeenCalledWith(expect.objectContaining({ timeout: 5_000 }))
      expect(deleteVideoMock).toHaveBeenCalledWith(expect.objectContaining({ timeout: 5_000 }))
    })

    it('stops before the next session at the deadline and reports hasMore', async () => {
      const now = Date.now()
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
      deleteVideoMock.mockImplementation(async () => {
        clock.mockReturnValue(now + 25_000)
      })

      expect(await run(options, twoSessions)).toEqual({ deletedCount: 1, errorCount: 0, hasMore: true })
      expect(getVideoMock).toHaveBeenCalledTimes(1)
    })

    it('does not count a call cut by the deadline as an error', async () => {
      const now = Date.now()
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
      getVideoMock.mockImplementation(async () => {
        clock.mockReturnValue(now + 25_000)
        throw new Error('Request timed out')
      })
      const payload = buildPayload(options, twoSessions)

      expect(await runStreamCleanup({ payload, req: { payload } as never })).toEqual({
        deletedCount: 0,
        errorCount: 0,
        hasMore: false,
      })
      expect((payload as { logger: { error: unknown } }).logger.error).not.toHaveBeenCalled()
    })

    it('does not report hasMore when the deadline cut a run that removed no session', async () => {
      const now = Date.now()
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
      const orphans: FindImpl = async (args) =>
        (args.where as { libraryId?: { not_in?: unknown } }).libraryId?.not_in
          ? { docs: [{ id: 'o-1' }, { id: 'o-2' }], totalDocs: 2 }
          : { docs: [], totalDocs: 0 }
      const deleteDoc = vi.fn(async () => {
        clock.mockReturnValue(now + 25_000)
        throw new Error('boom')
      })

      expect(await run(options, orphans, { delete: deleteDoc })).toEqual({
        deletedCount: 0,
        errorCount: 1,
        hasMore: false,
      })
      expect(deleteDoc).toHaveBeenCalledTimes(1)
    })

    it('reports hasMore when the deadline cuts a library after another library removed a session', async () => {
      const now = Date.now()
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
      getVideoMock.mockImplementation(async ({ videoId }: { videoId: string }) => {
        if (videoId === 'vb') {
          clock.mockReturnValue(now + 25_000)
          throw new Error('Request timed out')
        }
        return { status: BunnyStreamVideoStatus.Created }
      })
      const twoLibraries = createNormalizedOptions({
        collections: {
          alpha: { disablePayloadAccessControl: true, stream: createOwnStream(111, { cleanup: true }) },
          beta: { disablePayloadAccessControl: true, stream: createOwnStream(222, { cleanup: true }) },
        },
      } as never)
      const find: FindImpl = async (args) => {
        const eq = (args.where as { libraryId?: { equals?: string } }).libraryId?.equals
        if (eq === '111') {
          return { docs: [{ id: 's-a', videoId: 'va' }], totalDocs: 1 }
        }
        if (eq === '222') {
          return { docs: [{ id: 's-b', videoId: 'vb' }], totalDocs: 1 }
        }
        return { docs: [], totalDocs: 0 }
      }

      expect(await run(twoLibraries, find)).toEqual({ deletedCount: 1, errorCount: 0, hasMore: true })
    })

    it('does not start with less than two seconds left', async () => {
      expect(await run(options, twoSessions, {}, 1_999)).toEqual({ deletedCount: 0, errorCount: 0, hasMore: false })
      expect(getVideoMock).not.toHaveBeenCalled()
    })
  })

  it('throws when the plugin is not configured', async () => {
    await expect(runStreamCleanup({ payload: buildPayload(undefined, orphanFindImpl) })).rejects.toThrow(
      'the storage-bunny plugin is not configured',
    )
  })

  it('throws when no library turns on cleanup', async () => {
    const options = createNormalizedOptions({
      collections: { media: true },
      storage: createBaseStorage(),
      stream: createBaseStream(),
    } as never)
    await expect(run(options, orphanFindImpl)).rejects.toThrow('no stream library turns on `stream.cleanup`')
  })

  it('runs from the Payload task handler', async () => {
    const options = createNormalizedOptions({
      collections: { alpha: { disablePayloadAccessControl: true, stream: createOwnStream(111, { cleanup: true }) } },
    } as never)
    const find = vi.fn(orphanFindImpl)
    const payload = buildPayload(options, find)
    const handler = getStreamCleanupTask(options)!.handler as unknown as (args: {
      req: never
    }) => Promise<{ output: unknown }>

    expect(await handler({ req: { payload } as never })).toEqual({ output: {} })
    expect(find).toHaveBeenCalled()
  })

  describe('encoded videos', () => {
    const options = createNormalizedOptions({
      collections: {
        alpha: { disablePayloadAccessControl: true, stream: createOwnStream(111, { cleanup: true }) },
        beta: { disablePayloadAccessControl: true, stream: createOwnStream(222, { cleanup: true }) },
      },
    } as never)

    beforeEach(() => {
      getVideoMock.mockResolvedValue({ status: BunnyStreamVideoStatus.Finished })
    })

    const buildDb = (docRef: unknown, versionDocs: unknown[] = []) => ({
      collections: { alpha: { config: { versions: { maxPerDoc: 10 } } } },
      db: {
        findOne: vi.fn().mockResolvedValue(docRef),
        findVersions: vi.fn().mockResolvedValue({ docs: versionDocs }),
      },
    })

    it('deletes a video that no document references', async () => {
      const deleteDoc = vi.fn().mockResolvedValue({})
      const extras = buildDb(null)

      await run(options, sessionFindImpl, { ...extras, delete: deleteDoc })

      expect(extras.db.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ collection: 'alpha', where: { 'bunnyData.stream.videoId': { equals: 'v1' } } }),
      )
      expect(extras.db.findVersions).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'alpha',
          where: { 'version.bunnyData.stream.videoId': { equals: 'v1' } },
        }),
      )
      expect(deleteVideoMock).toHaveBeenCalledWith(expect.objectContaining({ libraryId: 111, videoId: 'v1' }))
      expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ id: 's-1' }))
    })

    it('keeps a video that a document references and drops only its session', async () => {
      const deleteDoc = vi.fn().mockResolvedValue({})

      await run(options, sessionFindImpl, { ...buildDb({ id: 'doc-1' }), delete: deleteDoc })

      expect(deleteVideoMock).not.toHaveBeenCalled()
      expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ id: 's-1' }))
    })

    it('keeps a video that only a version references', async () => {
      const deleteDoc = vi.fn().mockResolvedValue({})

      await run(options, sessionFindImpl, { ...buildDb(null, [{ id: 'version-1' }]), delete: deleteDoc })

      expect(deleteVideoMock).not.toHaveBeenCalled()
      expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ id: 's-1' }))
    })
  })
})
