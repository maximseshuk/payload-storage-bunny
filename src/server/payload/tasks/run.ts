import type { Payload, PayloadRequest } from 'payload'

import { hasAnyStreamCleanup, hasAnyStreamStatusSync } from '@/server/payload/options/inspect.js'
import { runStreamCleanup, type StreamCleanupResult } from '@/server/payload/tasks/runStreamCleanup.js'
import { syncStreamStatus, type StreamStatusSyncResult } from '@/server/payload/tasks/syncStreamStatus.js'
import type { NormalizedBunnyStorageOptions } from '@/shared/types/index.js'

export const BUNNY_TASK_NAMES = ['cleanup', 'status-sync'] as const

export type BunnyTaskName = (typeof BUNNY_TASK_NAMES)[number]

export type BunnyTaskResult = { hasMore: false; skipped: true } | StreamCleanupResult | StreamStatusSyncResult

const runningTasks = new Set<BunnyTaskName>()

export const isBunnyTaskEnabled = (options: NormalizedBunnyStorageOptions, task: string): task is BunnyTaskName =>
  task === 'cleanup' ? hasAnyStreamCleanup(options) : task === 'status-sync' && hasAnyStreamStatusSync(options)

export const runBunnyTask = async ({
  limit,
  payload,
  req,
  task,
}: {
  limit?: number
  payload: Payload
  req?: PayloadRequest
  task: BunnyTaskName
}): Promise<BunnyTaskResult> => {
  if (runningTasks.has(task)) {
    payload.logger.warn({ msg: `[bunny:tasks] ${task}: skipped, a run is already in progress` })
    return { hasMore: false, skipped: true }
  }
  runningTasks.add(task)
  try {
    return task === 'cleanup'
      ? await runStreamCleanup({ payload, req })
      : await syncStreamStatus({ limit, payload, req })
  } finally {
    runningTasks.delete(task)
  }
}

export const countTaskErrors = (result: BunnyTaskResult): number =>
  'errorCount' in result ? result.errorCount : 'failed' in result ? result.failed : 0
