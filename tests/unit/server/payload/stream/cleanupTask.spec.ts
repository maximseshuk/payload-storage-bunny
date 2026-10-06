import { beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteVideoMock, getVideoMock } = vi.hoisted(() => ({
  deleteVideoMock: vi.fn(),
  getVideoMock: vi.fn(),
}))

vi.mock('@/server/bunny/stream.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/bunny/stream.js')>()
  return { ...actual, deleteStreamVideo: deleteVideoMock, getStreamVideo: getVideoMock }
})

const { OPTIONS_DEFAULTS } = await import('@/server/payload/options/defaults.js')
const { hasAnyStreamCleanup } = await import('@/server/payload/options/inspect.js')
const { createNormalizedOptions } = await import('@/server/payload/options/normalizer.js')
const { BunnyStreamVideoStatus } = await import('@/server/bunny/stream.js')
const { getStreamCleanupTask, warnIfCleanupQueueNotRun } = await import('@/server/payload/stream/cleanupTask.js')

const { createBaseStorage, createBaseStream, createOwnStream } =
  await import('../../../../helpers/unit/optionsBuilders.js')

type FindImpl = (args: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>>; totalDocs: number }>

const buildReq = (find: FindImpl, extras: Record<string, unknown> = {}) =>
  ({
    payload: {
      delete: vi.fn().mockResolvedValue({}),
      find,
      logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
      ...extras,
    },
  }) as never

const runHandler = async (task: NonNullable<ReturnType<typeof getStreamCleanupTask>>, req: never) => {
  await (task.handler as unknown as (args: { req: never }) => Promise<unknown>)({ req })
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

describe('stream cleanup task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVideoMock.mockResolvedValue({ status: BunnyStreamVideoStatus.Created })
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

    const task = getStreamCleanupTask(options)!
    await runHandler(task, buildReq(find))

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

    const task = getStreamCleanupTask(options)!
    await runHandler(
      task,
      buildReq(orphanFindImpl, { delete: deleteDoc, logger: { debug: vi.fn(), error: vi.fn(), warn } }),
    )

    expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ id: 'orphan-1' }))
    expect(warn).toHaveBeenCalled()
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

    it('deletes a video that no document references', async () => {
      const count = vi.fn().mockResolvedValue({ totalDocs: 0 })
      const deleteDoc = vi.fn().mockResolvedValue({})

      await runHandler(getStreamCleanupTask(options)!, buildReq(sessionFindImpl, { count, delete: deleteDoc }))

      expect(count).toHaveBeenCalledTimes(1)
      expect(count).toHaveBeenCalledWith(
        expect.objectContaining({ collection: 'alpha', where: { 'bunnyData.stream.videoId': { equals: 'v1' } } }),
      )
      expect(deleteVideoMock).toHaveBeenCalledWith(expect.objectContaining({ libraryId: 111, videoId: 'v1' }))
      expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ id: 's-1' }))
    })

    it('keeps a video that a document references and drops only its session', async () => {
      const count = vi.fn().mockResolvedValue({ totalDocs: 1 })
      const deleteDoc = vi.fn().mockResolvedValue({})

      await runHandler(getStreamCleanupTask(options)!, buildReq(sessionFindImpl, { count, delete: deleteDoc }))

      expect(deleteVideoMock).not.toHaveBeenCalled()
      expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ id: 's-1' }))
    })
  })

  describe('task registration', () => {
    it('uses the global schedule when set', () => {
      const options = createNormalizedOptions({
        collections: { media: true },
        storage: createBaseStorage(),
        stream: { ...createBaseStream(), cleanup: { schedule: { cron: '13 37 * * *', queue: 'custom-queue' } } },
      } as never)
      const task = getStreamCleanupTask(options)
      expect(task?.schedule?.[0]).toEqual({ cron: '13 37 * * *', queue: 'custom-queue' })
    })

    it('falls back to the default schedule when only a collection enables cleanup', () => {
      const options = createNormalizedOptions({
        collections: { videos: { disablePayloadAccessControl: true, stream: createOwnStream(500, { cleanup: true }) } },
      } as never)
      const task = getStreamCleanupTask(options)
      expect(task?.schedule?.[0]).toEqual(OPTIONS_DEFAULTS.stream.cleanup.schedule)
      expect(hasAnyStreamCleanup(options)).toBe(true)
    })

    it('returns undefined and reports no cleanup when nothing enables it', () => {
      const options = createNormalizedOptions({
        collections: { media: true },
        storage: createBaseStorage(),
        stream: createBaseStream(),
      } as never)
      expect(getStreamCleanupTask(options)).toBeUndefined()
      expect(hasAnyStreamCleanup(options)).toBe(false)
    })
  })

  describe('queue warning', () => {
    const task = { schedule: [{ cron: '0 2 * * *', queue: 'storage-bunny' }] } as never
    const payloadWith = (autoRun: unknown) =>
      ({ config: { jobs: { autoRun } }, logger: { warn: vi.fn() } }) as unknown as {
        logger: { warn: ReturnType<typeof vi.fn> }
      }

    it.each([
      { autoRun: undefined, name: 'no autoRun' },
      { autoRun: [{ cron: '* * * * *' }], name: 'only the default queue' },
      { autoRun: [{ cron: '* * * * *', queue: 'other' }], name: 'another queue' },
    ])('warns when autoRun does not run the cleanup queue ($name)', ({ autoRun }) => {
      const payload = payloadWith(autoRun)
      warnIfCleanupQueueNotRun({ payload: payload as never, task })
      expect(payload.logger.warn).toHaveBeenCalledWith({
        msg: '[bunny:stream] cleanup: no jobs.autoRun entry runs the "storage-bunny" queue, so the cleanup task only runs if a worker processes that queue',
      })
    })

    it('checks the queue of every schedule entry', () => {
      const payload = payloadWith([{ cron: '* * * * *', queue: 'storage-bunny' }])
      const schedule = [{ cron: '0 2 * * *', queue: 'storage-bunny' }, { cron: '0 3 * * *' }]
      warnIfCleanupQueueNotRun({ payload: payload as never, task: { schedule } as never })
      expect(payload.logger.warn).toHaveBeenCalledExactlyOnceWith({
        msg: '[bunny:stream] cleanup: no jobs.autoRun entry runs the "default" queue, so the cleanup task only runs if a worker processes that queue',
      })
    })

    it.each([
      { autoRun: [{ cron: '* * * * *', queue: 'storage-bunny' }], name: 'the cleanup queue' },
      { autoRun: [{ allQueues: true, cron: '* * * * *' }], name: 'allQueues' },
      { autoRun: () => [], name: 'a function' },
    ])('stays quiet when autoRun covers the queue ($name)', ({ autoRun }) => {
      const payload = payloadWith(autoRun)
      warnIfCleanupQueueNotRun({ payload: payload as never, task })
      expect(payload.logger.warn).not.toHaveBeenCalled()
    })
  })
})
