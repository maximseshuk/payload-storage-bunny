import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveAccountApiKey } from '@/cli/commands/init/wizard.js'

import { jsonResponse, spyFetch } from '../../../../helpers/unit/fetchMock.js'

const prompts = vi.hoisted(() => ({ password: vi.fn() }))

vi.mock('@clack/prompts', () => ({
  cancel: vi.fn(),
  confirm: vi.fn(),
  isCancel: (value: unknown) => typeof value === 'symbol',
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  multiselect: vi.fn(),
  note: vi.fn(),
  password: prompts.password,
  select: vi.fn(),
  spinner: () => ({ message: vi.fn(), start: vi.fn(), stop: vi.fn() }),
  text: vi.fn(),
}))

const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }

describe('resolveAccountApiKey', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    prompts.password.mockReset()
  })

  it('asks for another key when Bunny answers 401', async () => {
    const calls = spyFetch(() => (calls.length === 1 ? new Response('', { status: 401 }) : jsonResponse([])))
    prompts.password.mockResolvedValue('good-key')

    await expect(resolveAccountApiKey('bad-key', logger)).resolves.toBe('good-key')
    expect(prompts.password).toHaveBeenCalledTimes(1)
  })

  it('rethrows a server error instead of calling the key bad', async () => {
    spyFetch(() => new Response('down', { status: 500 }))

    await expect(resolveAccountApiKey('some-key', logger)).rejects.toThrow(/failed \(500\)/)
    expect(prompts.password).not.toHaveBeenCalled()
  })

  it('rethrows a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))

    await expect(resolveAccountApiKey('some-key', logger)).rejects.toThrow(/network error/)
    expect(prompts.password).not.toHaveBeenCalled()
  })

  it('exits with 0 when the key prompt is cancelled', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    prompts.password.mockResolvedValue(Symbol('cancel'))

    await expect(resolveAccountApiKey(undefined, logger)).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(0)
  })
})
