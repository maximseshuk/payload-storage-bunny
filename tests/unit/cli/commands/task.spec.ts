import { beforeEach, describe, expect, it, vi } from 'vitest'

const { cleanupMock, syncMock } = vi.hoisted(() => ({
  cleanupMock: vi.fn(),
  syncMock: vi.fn(),
}))

vi.mock('@/server/payload/tasks/runStreamCleanup.js', () => ({ runStreamCleanup: cleanupMock }))
vi.mock('@/server/payload/tasks/syncStreamStatus.js', () => ({ syncStreamStatus: syncMock }))

const { taskCommand } = await import('@/cli/commands/task.js')

const validate = async (input: Record<string, unknown>) => {
  const result = await taskCommand.input['~standard'].validate(input)
  if (result.issues) {
    throw new Error(result.issues.map((issue) => issue.message).join('\n'))
  }
  return result.value as Record<string, unknown>
}

const run = async (input: Record<string, unknown>) => {
  const info = vi.fn()
  const payload = { logger: { info } }
  const result = await taskCommand.handler({
    args: await validate(input),
    getConfig: vi.fn(),
    getPayload: vi.fn().mockResolvedValue(payload),
    help: {} as never,
    isJSON: false,
  })
  return { info, payload, result }
}

describe('bunny:task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanupMock.mockResolvedValue({ deletedCount: 2, errorCount: 0, hasMore: false })
    syncMock.mockResolvedValue({ checked: 5, failed: 0, hasMore: false, updated: 3 })
  })

  it('takes the task as an argument and limit as an option', async () => {
    expect(taskCommand.cli).toEqual({ task: 'argument' })
    expect(await validate({ limit: 10, task: 'status-sync' })).toEqual({ limit: 10, task: 'status-sync' })
    await expect(validate({ task: 'reindex' })).rejects.toThrow(/Invalid input/)
    await expect(validate({ limit: 0, task: 'status-sync' })).rejects.toThrow(/Invalid input/)
    await expect(validate({})).rejects.toThrow(/Invalid input/)
  })

  it('runs status-sync with the limit and exits with 0', async () => {
    const { payload, result } = await run({ limit: 10, task: 'status-sync' })
    expect(syncMock).toHaveBeenCalledWith({ limit: 10, payload, req: undefined })
    expect(result).toEqual({
      exitCode: 0,
      result: { checked: 5, failed: 0, hasMore: false, task: 'status-sync', updated: 3 },
    })
  })

  it('runs cleanup and exits with 0', async () => {
    const { info, payload, result } = await run({ task: 'cleanup' })
    expect(cleanupMock).toHaveBeenCalledWith({ payload, req: undefined })
    expect(result).toEqual({ exitCode: 0, result: { deletedCount: 2, errorCount: 0, hasMore: false, task: 'cleanup' } })
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ msg: '[bunny:tasks] cleanup: done' }))
  })

  it('exits with 1 when the task counts errors', async () => {
    cleanupMock.mockResolvedValue({ deletedCount: 0, errorCount: 1, hasMore: false })
    syncMock.mockResolvedValue({ checked: 0, failed: 2, hasMore: false, updated: 0 })
    expect((await run({ task: 'cleanup' })).result).toMatchObject({ exitCode: 1 })
    expect((await run({ task: 'status-sync' })).result).toMatchObject({ exitCode: 1 })
  })

  it('exits with 1 and logs when the task name is unknown', async () => {
    const { createCLI } = await import('payload/cli')
    const getPayload = vi.fn()
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      const cli = await createCLI(
        {
          configDir: process.cwd(),
          destroy: vi.fn(),
          getConfig: vi.fn().mockResolvedValue({ cli: { commands: { 'bunny:task': taskCommand } } }),
          getPayload,
          isScheduled: false,
          markScheduled: vi.fn(),
        },
        { isJSON: false },
      )

      await expect(cli.parseAsync(['node', 'payload', 'bunny:task', 'reindex'])).rejects.toMatchObject({ exitCode: 1 })
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('reindex'))
      expect(getPayload).not.toHaveBeenCalled()
    } finally {
      stderr.mockRestore()
    }
  })
})
