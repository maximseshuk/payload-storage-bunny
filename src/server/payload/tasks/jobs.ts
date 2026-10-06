import type { Payload, TaskConfig } from 'payload'

import { getBunnyOptions } from '@/server/payload/options/access.js'
import { OPTIONS_DEFAULTS } from '@/server/payload/options/defaults.js'
import { hasAnyStreamCleanup, hasAnyStreamStatusSync } from '@/server/payload/options/inspect.js'
import { runBunnyTask } from '@/server/payload/tasks/run.js'
import type { NormalizedBunnyStorageOptions } from '@/shared/types/index.js'

export const getStreamCleanupTask = (
  options: NormalizedBunnyStorageOptions,
): TaskConfig<'StorageBunnyStreamCleanup'> | undefined => {
  if (!hasAnyStreamCleanup(options)) {
    return undefined
  }

  return {
    slug: 'StorageBunnyStreamCleanup',
    handler: async ({ req }) => {
      await runBunnyTask({ payload: req.payload, req, task: 'cleanup' })
      return { output: {} }
    },
    schedule: [options.stream?.cleanup?.schedule ?? OPTIONS_DEFAULTS.stream.cleanup.schedule],
  }
}

export const getStreamStatusSyncTask = (
  options: NormalizedBunnyStorageOptions,
): TaskConfig<'StorageBunnyStreamStatusSync'> | undefined => {
  if (!hasAnyStreamStatusSync(options)) {
    return undefined
  }

  return {
    slug: 'StorageBunnyStreamStatusSync',
    handler: async ({ req }) => {
      await runBunnyTask({ payload: req.payload, req, task: 'status-sync' })
      return { output: {} }
    },
    schedule: [
      (options.stream?.status && options.stream.status.sync?.schedule) || OPTIONS_DEFAULTS.stream.status.sync.schedule,
    ],
  }
}

export const warnIfTaskQueuesNotRun = ({ payload, tasks }: { payload: Payload; tasks: TaskConfig[] }): void => {
  const autoRun = payload.config.jobs?.autoRun

  if (typeof autoRun === 'function' || getBunnyOptions(payload)?.tasks?.secret) {
    return
  }

  const tasksByQueue = new Map<string, string[]>()
  for (const task of tasks) {
    for (const entry of task.schedule ?? []) {
      const queue = entry.queue ?? 'default'
      const slugs = tasksByQueue.get(queue) ?? []
      if (!slugs.includes(task.slug)) {
        slugs.push(task.slug)
      }
      tasksByQueue.set(queue, slugs)
    }
  }

  for (const [queue, slugs] of tasksByQueue) {
    const covered = autoRun?.some((entry) => entry.allQueues || (entry.queue ?? 'default') === queue)

    if (!covered) {
      payload.logger.warn({
        msg: `[bunny:tasks] no jobs.autoRun entry runs the "${queue}" queue. Its tasks (${slugs.join(', ')}) run only when a worker processes that queue, or when you start them with the tasks endpoint or the bunny:task CLI`,
      })
    }
  }
}
