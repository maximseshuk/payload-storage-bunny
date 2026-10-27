import { type CLICommand, strictObject, z } from 'payload'
import { defineCLICommand } from 'payload/cli'

import { BUNNY_TASK_NAMES, countTaskErrors, runBunnyTask } from '@/server/payload/tasks/run.js'

export const taskCommand: CLICommand = defineCLICommand({
  cli: { task: 'argument' },
  description: 'Run a storage-bunny background task now: cleanup or status-sync.',
  examples: ['payload bunny:task cleanup', 'payload bunny:task status-sync --limit 200'],
  handler: async ({ args, getPayload }) => {
    const payload = await getPayload()
    const result = await runBunnyTask({ limit: args.limit, payload, task: args.task })
    payload.logger.info({ msg: `[bunny:tasks] ${args.task}: done`, ...result })
    return { exitCode: countTaskErrors(result) > 0 ? 1 : 0, result: { task: args.task, ...result } }
  },
  input: strictObject({
    limit: z
      .optional(z.int().check(z.positive()))
      .check(z.describe('status-sync only: documents loaded per database query.')),
    task: z.enum(BUNNY_TASK_NAMES).check(z.describe('Task to run: cleanup or status-sync.')),
  }),
})
