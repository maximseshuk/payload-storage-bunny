import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Ledger, ProvisionResult } from '@/cli/lib/provision.js'

import { initAnswers } from '../../../../helpers/unit/initAnswers.js'

const mocks = vi.hoisted(() => ({
  appendEnvLines: vi.fn(),
  confirm: vi.fn(),
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  password: vi.fn(),
  preflightInit: vi.fn(),
  provisionInit: vi.fn(),
  runWizard: vi.fn(),
}))

vi.mock('@clack/prompts', () => ({
  cancel: vi.fn(),
  confirm: mocks.confirm,
  intro: vi.fn(),
  isCancel: (value: unknown) => typeof value === 'symbol',
  log: mocks.log,
  note: vi.fn(),
  outro: vi.fn(),
  password: mocks.password,
  spinner: () => ({ message: vi.fn(), start: vi.fn(), stop: vi.fn() }),
}))

vi.mock('@/cli/commands/init/wizard.js', () => ({
  resolveAccountApiKey: async () => 'account-key',
  runWizard: mocks.runWizard,
}))

vi.mock('@/cli/lib/envFile.js', () => ({ appendEnvLines: mocks.appendEnvLines }))

vi.mock('@/cli/lib/provision.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/cli/lib/provision.js')>()),
  preflightInit: mocks.preflightInit,
  provisionInit: mocks.provisionInit,
}))

const { runInit } = await import('@/cli/commands/init/run.js')

const edgeAnswers = initAnswers({ clientUploads: true, deployEdge: true, service: 'storage', storageAccess: 'http' })

const provisioned = (edge: { secret: string; secretKnown: boolean }): ProvisionResult => ({
  ledger: { created: [], reused: [] },
  storage: {
    apiKey: 'zone-pass',
    edge: { scriptUrl: 'https://uploader.b-cdn.net', ...edge },
    hostname: 'my-app.b-cdn.net',
    region: 'de',
    zoneName: 'my-app',
  },
})

class ExitCalled extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${String(code)}`)
  }
}

const run = async (): Promise<number | undefined> => {
  try {
    await runInit({ version: '4.0.0' })
    return undefined
  } catch (err) {
    if (err instanceof ExitCalled) {
      return err.code
    }
    throw err
  }
}

const warnings = (): string => mocks.log.warn.mock.calls.map((call) => String(call[0])).join('\n')

describe('runInit', () => {
  const isTTY = process.stdout.isTTY
  const sigintListeners = process.listenerCount('SIGINT')

  beforeEach(() => {
    process.stdout.isTTY = true
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new ExitCalled(code as number | undefined)
    })
    mocks.runWizard.mockResolvedValue(edgeAnswers)
    mocks.preflightInit.mockResolvedValue({ edgeScript: 'reuse', issues: [], storage: 'create' })
    mocks.confirm.mockResolvedValue(true)
    mocks.password.mockResolvedValue('')
    mocks.appendEnvLines.mockReturnValue({ appended: [], created: false, filePath: '/app/.env', skipped: [] })
  })

  afterEach(() => {
    process.stdout.isTTY = isTTY
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('does not write the Edge secret placeholder to .env and says so', async () => {
    mocks.provisionInit.mockResolvedValue(provisioned({ secret: 'random', secretKnown: false }))

    expect(await run()).toBeUndefined()

    const written = mocks.appendEnvLines.mock.calls[0][1] as Array<{ name: string }>
    expect(written.map((entry) => entry.name)).not.toContain('BUNNY_EDGE_SECRET')
    expect(warnings()).toMatch(/BUNNY_EDGE_SECRET was not written/)
  })

  it('writes a known Edge secret to .env', async () => {
    mocks.provisionInit.mockResolvedValue(provisioned({ secret: 'known-secret', secretKnown: true }))

    await run()

    expect(mocks.appendEnvLines.mock.calls[0][1]).toContainEqual({ name: 'BUNNY_EDGE_SECRET', value: 'known-secret' })
    expect(warnings()).not.toMatch(/BUNNY_EDGE_SECRET was not written/)
  })

  it('exits with 0 and provisions nothing when the shared-secret prompt is cancelled', async () => {
    mocks.password.mockResolvedValue(Symbol('cancel'))

    expect(await run()).toBe(0)
    expect(mocks.provisionInit).not.toHaveBeenCalled()
  })

  it('passes a typed shared secret to provisioning', async () => {
    mocks.password.mockResolvedValue('  typed-secret ')
    mocks.provisionInit.mockResolvedValue(provisioned({ secret: 'typed-secret', secretKnown: true }))

    await run()

    expect(mocks.provisionInit).toHaveBeenCalledWith(
      expect.objectContaining({ edge: { reuseScript: true, sharedSecret: 'typed-secret' } }),
    )
  })

  it('prints what was created and exits with 130 on Ctrl+C during provisioning', async () => {
    mocks.provisionInit.mockImplementation(async ({ ledger }: { ledger: Ledger }) => {
      ledger.created.push({ id: 100, kind: 'storage zone', name: 'my-app' })
      process.emit('SIGINT')
      return new Promise(() => {})
    })

    await run()

    expect(process.exit).toHaveBeenCalledWith(130)
    expect(mocks.log.info).toHaveBeenCalledWith('Created so far: storage zone "my-app" (id 100)')
    expect(process.listenerCount('SIGINT')).toBe(sigintListeners)
  })
})
