import { describe, expect, it, vi } from 'vitest'

import { OPTIONS_DEFAULTS } from '@/server/payload/options/defaults.js'
import { hasAnyStreamCleanup } from '@/server/payload/options/inspect.js'
import { createNormalizedOptions } from '@/server/payload/options/normalizer.js'
import { getStreamCleanupTask, getStreamStatusSyncTask, warnIfTaskQueuesNotRun } from '@/server/payload/tasks/jobs.js'
import { PLUGIN_KEY } from '@/shared/constants.js'

import { createBaseStorage, createBaseStream, createOwnStream } from '../../../../helpers/unit/optionsBuilders.js'

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

  it('registers the status sync task with the global schedule or the default', () => {
    const withSchedule = createNormalizedOptions({
      collections: { media: true },
      storage: createBaseStorage(),
      stream: { ...createBaseStream(), status: { sync: { schedule: { cron: '* * * * *', queue: 'q' } } } },
    } as never)
    expect(getStreamStatusSyncTask(withSchedule)?.schedule?.[0]).toEqual({ cron: '* * * * *', queue: 'q' })

    const perCollection = createNormalizedOptions({
      collections: {
        videos: { disablePayloadAccessControl: true, stream: createOwnStream(500, { status: { sync: true } }) },
      },
    } as never)
    expect(getStreamStatusSyncTask(perCollection)?.slug).toBe('StorageBunnyStreamStatusSync')
    expect(getStreamStatusSyncTask(perCollection)?.schedule?.[0]).toEqual(OPTIONS_DEFAULTS.stream.status.sync.schedule)
  })

  it('returns undefined and reports no cleanup when nothing enables it', () => {
    const options = createNormalizedOptions({
      collections: { media: true },
      storage: createBaseStorage(),
      stream: createBaseStream(),
    } as never)
    expect(getStreamCleanupTask(options)).toBeUndefined()
    expect(getStreamStatusSyncTask(options)).toBeUndefined()
    expect(hasAnyStreamCleanup(options)).toBe(false)
  })
})

describe('queue warning', () => {
  const task = { slug: 'StorageBunnyStreamCleanup', schedule: [{ cron: '0 2 * * *', queue: 'storage-bunny' }] }
  const payloadWith = (autoRun: unknown, secret?: string) =>
    ({
      config: { custom: { [PLUGIN_KEY]: { config: { tasks: { secret } } } }, jobs: { autoRun } },
      logger: { warn: vi.fn() },
    }) as unknown as {
      logger: { warn: ReturnType<typeof vi.fn> }
    }
  const message = (queue: string, slugs: string) =>
    `[bunny:tasks] no jobs.autoRun entry runs the "${queue}" queue. Its tasks (${slugs}) run only when a worker processes that queue, or when you start them with the tasks endpoint or the bunny:task CLI`

  it.each([
    { autoRun: undefined, name: 'no autoRun' },
    { autoRun: [{ cron: '* * * * *' }], name: 'only the default queue' },
    { autoRun: [{ cron: '* * * * *', queue: 'other' }], name: 'another queue' },
  ])('warns when autoRun does not run the task queue ($name)', ({ autoRun }) => {
    const payload = payloadWith(autoRun)
    warnIfTaskQueuesNotRun({ payload: payload as never, tasks: [task as never] })
    expect(payload.logger.warn).toHaveBeenCalledWith({ msg: message('storage-bunny', 'StorageBunnyStreamCleanup') })
  })

  it('checks the queue of every schedule entry', () => {
    const payload = payloadWith([{ cron: '* * * * *', queue: 'storage-bunny' }])
    const schedule = [{ cron: '0 2 * * *', queue: 'storage-bunny' }, { cron: '0 3 * * *' }]
    warnIfTaskQueuesNotRun({ payload: payload as never, tasks: [{ ...task, schedule } as never] })
    expect(payload.logger.warn).toHaveBeenCalledExactlyOnceWith({
      msg: message('default', 'StorageBunnyStreamCleanup'),
    })
  })

  it('names every task on the same queue in one warning', () => {
    const payload = payloadWith(undefined)
    const sync = { slug: 'StorageBunnyStreamStatusSync', schedule: [{ cron: '*/5 * * * *', queue: 'storage-bunny' }] }
    warnIfTaskQueuesNotRun({ payload: payload as never, tasks: [task, sync] as never })
    expect(payload.logger.warn).toHaveBeenCalledExactlyOnceWith({
      msg: message('storage-bunny', 'StorageBunnyStreamCleanup, StorageBunnyStreamStatusSync'),
    })
  })

  it('stays quiet when tasks.secret is set', () => {
    const payload = payloadWith(undefined, 'a-long-enough-secret')
    warnIfTaskQueuesNotRun({ payload: payload as never, tasks: [task as never] })
    expect(payload.logger.warn).not.toHaveBeenCalled()
  })

  it.each([
    { autoRun: [{ cron: '* * * * *', queue: 'storage-bunny' }], name: 'the task queue' },
    { autoRun: [{ allQueues: true, cron: '* * * * *' }], name: 'allQueues' },
    { autoRun: () => [], name: 'a function' },
  ])('stays quiet when autoRun covers the queue ($name)', ({ autoRun }) => {
    const payload = payloadWith(autoRun)
    warnIfTaskQueuesNotRun({ payload: payload as never, tasks: [task as never] })
    expect(payload.logger.warn).not.toHaveBeenCalled()
  })
})
