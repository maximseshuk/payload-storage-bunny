import { beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteVideoMock, getVideoMock } = vi.hoisted(() => ({
  deleteVideoMock: vi.fn(),
  getVideoMock: vi.fn(),
}))

vi.mock('@/stream/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stream/api.js')>()
  return { ...actual, deleteStreamVideo: deleteVideoMock, getStreamVideo: getVideoMock }
})

const { CONFIG_DEFAULTS } = await import('@/config/defaults.js')
const { hasAnyStreamCleanup } = await import('@/config/inspect.js')
const { createNormalizedConfig } = await import('@/config/normalizer.js')
const { BunnyStreamVideoStatus } = await import('@/stream/api.js')
const { getStreamCleanupTask } = await import('@/stream/cleanupTask.js')

const { createBaseStorage, createBaseStream, createOwnStream } = await import('../../helpers/unit/configBuilders.js')

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

    const config = createNormalizedConfig({
      collections: {
        alpha: { disablePayloadAccessControl: true, stream: createOwnStream(111, { cleanup: { maxAge: 100 } }) },
        beta: { disablePayloadAccessControl: true, stream: createOwnStream(222, { cleanup: { maxAge: 10000 } }) },
      },
    } as never)

    const task = getStreamCleanupTask(config)!
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

    const config = createNormalizedConfig({
      collections: { alpha: { disablePayloadAccessControl: true, stream: createOwnStream(111, { cleanup: true }) } },
    } as never)

    const task = getStreamCleanupTask(config)!
    await runHandler(
      task,
      buildReq(orphanFindImpl, { delete: deleteDoc, logger: { debug: vi.fn(), error: vi.fn(), warn } }),
    )

    expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ id: 'orphan-1' }))
    expect(warn).toHaveBeenCalled()
  })

  describe('task registration', () => {
    it('uses the global schedule when set', () => {
      const config = createNormalizedConfig({
        collections: { media: true },
        storage: createBaseStorage(),
        stream: { ...createBaseStream(), cleanup: { schedule: { cron: '13 37 * * *', queue: 'custom-queue' } } },
      } as never)
      const task = getStreamCleanupTask(config)
      expect(task?.schedule?.[0]).toEqual({ cron: '13 37 * * *', queue: 'custom-queue' })
    })

    it('falls back to the default schedule when only a collection enables cleanup', () => {
      const config = createNormalizedConfig({
        collections: { videos: { disablePayloadAccessControl: true, stream: createOwnStream(500, { cleanup: true }) } },
      } as never)
      const task = getStreamCleanupTask(config)
      expect(task?.schedule?.[0]).toEqual(CONFIG_DEFAULTS.stream.cleanup.schedule)
    })

    it('returns undefined and reports no cleanup when nothing enables it', () => {
      const config = createNormalizedConfig({
        collections: { media: true },
        storage: createBaseStorage(),
        stream: createBaseStream(),
      } as never)
      expect(getStreamCleanupTask(config)).toBeUndefined()
      expect(hasAnyStreamCleanup(config)).toBe(false)
    })

    it('is defined exactly when hasAnyStreamCleanup is true', () => {
      const config = createNormalizedConfig({
        collections: { videos: { disablePayloadAccessControl: true, stream: createOwnStream(1, { cleanup: true }) } },
      } as never)
      expect(getStreamCleanupTask(config)).toBeDefined()
      expect(hasAnyStreamCleanup(config)).toBe(true)
    })
  })
})
