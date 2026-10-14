import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runInit = vi.hoisted(() => vi.fn())

vi.mock('@/cli/commands/init/run.js', () => ({ runInit }))

const runCli = async (thrown: unknown): Promise<string> => {
  runInit.mockRejectedValue(thrown)
  const exited = new Promise<void>((resolve) => {
    vi.spyOn(process, 'exit').mockImplementation((() => resolve()) as never)
  })
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

  vi.resetModules()
  await import('@/cli/index.js')
  await exited

  expect(process.exit).toHaveBeenCalledWith(1)
  return stderr.mock.calls.map((call) => String(call[0])).join('')
}

describe('CLI error output', () => {
  const argv = process.argv

  beforeEach(() => {
    process.argv = ['node', 'payload-storage-bunny', 'init']
  })

  afterEach(() => {
    process.argv = argv
    vi.restoreAllMocks()
  })

  it('prints the error message and its cause', async () => {
    expect(await runCli(new Error('request failed', { cause: new Error('ECONNRESET') }))).toBe(
      'request failed (cause: ECONNRESET)\n',
    )
  })

  it('prints a non-Error cause as JSON', async () => {
    expect(await runCli(new Error('request failed', { cause: { code: 42 } }))).toBe(
      'request failed (cause: {"code":42})\n',
    )
  })

  it('prints a thrown object as JSON', async () => {
    expect(await runCli({ status: 500 })).toBe('{"status":500}\n')
  })

  it('prints a thrown string as is', async () => {
    expect(await runCli('boom')).toBe('boom\n')
  })

  it('falls back to String for an object that JSON cannot serialize', async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(await runCli(circular)).toBe('[object Object]\n')
  })
})
