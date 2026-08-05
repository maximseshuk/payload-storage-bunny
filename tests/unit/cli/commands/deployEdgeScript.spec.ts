import { describe, expect, it, vi } from 'vitest'

import { buildDeployCli } from '@/cli/commands/deployEdgeScript.js'

const FLAGS = [
  '--api-key',
  '--env-file',
  '--zones-file',
  '--secret',
  '--script-url',
  '--name',
  '--cdn-tier',
  '--allowed-origins',
  '--connection-limit',
  '--request-limit',
  '--check',
  '--new',
  '--dry-run',
  '--no-print-secret',
  '--no-prune',
  '--skip-harden',
]

const captureHelp = (): string => {
  const cli = buildDeployCli()
  const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
  cli.outputHelp()
  const out = spy.mock.calls.map((call) => call.join(' ')).join('\n')
  spy.mockRestore()
  return out
}

describe('deploy-edge-script --help', () => {
  it('lists every flag', () => {
    const out = captureHelp()
    for (const flag of FLAGS) {
      expect(out).toContain(flag)
    }
  })

  it('parses value, negatable, and boolean flags into the expected options', () => {
    const cli = buildDeployCli()
    cli.parse(['', '', '--name', 'custom', '--connection-limit', '20', '--check', '--no-print-secret', '--no-prune'], {
      run: false,
    })

    expect(cli.options.name).toBe('custom')
    expect(cli.options.connectionLimit).toBe(20)
    expect(cli.options.check).toBe(true)
    expect(cli.options.printSecret).toBe(false)
    expect(cli.options.prune).toBe(false)
  })

  it('defaults the negatable flags to enabled', () => {
    const cli = buildDeployCli()
    cli.parse(['', ''], { run: false })

    expect(cli.options.printSecret).toBe(true)
    expect(cli.options.prune).toBe(true)
  })
})
