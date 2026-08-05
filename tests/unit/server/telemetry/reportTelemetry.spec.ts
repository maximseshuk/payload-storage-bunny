import type { Payload } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createNormalizedConfig } from '@/server/payload/config/normalizer.js'
import { reportTelemetry } from '@/server/telemetry/index.js'
import type { BunnyStorageConfig } from '@/shared/types/config.js'
import type { NormalizedBunnyStorageConfig } from '@/shared/types/configNormalized.js'

import { createBaseStorage } from '../../../helpers/unit/configBuilders.js'

const makeConfig = (overrides: Partial<BunnyStorageConfig> = {}): NormalizedBunnyStorageConfig =>
  createNormalizedConfig({ collections: { media: true }, storage: createBaseStorage(), ...overrides })

const info = vi.fn()

const makePayload = (telemetry?: boolean): Payload =>
  ({
    config: { serverURL: 'https://app.example', telemetry },
    logger: { info },
    secret: 'sekret',
  }) as unknown as Payload

const run = (config: NormalizedBunnyStorageConfig, deps: Parameters<typeof reportTelemetry>[1]) =>
  reportTelemetry({ config, payload: makePayload() }, { env: {}, readState: () => ({}), ...deps })

beforeEach(() => {
  info.mockReset()
})

describe('reportTelemetry', () => {
  it('sends once, prints the notice, and persists the throttle on a fresh run', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const writeState = vi.fn()

    await run(makeConfig(), { send, writeState })

    expect(send).toHaveBeenCalledTimes(1)
    const [report, endpoint] = send.mock.calls[0]
    expect(report).toMatchObject({ product: 'payload-storage-bunny', schema: 1 })
    expect(endpoint).toBe('https://telemetry.seshuk.im/v1/collect')
    expect(info).toHaveBeenCalledTimes(1)
    expect(writeState).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ noticeShown: true }))
  })

  it('uses a custom endpoint from telemetry.endpoint', async () => {
    const send = vi.fn().mockResolvedValue(undefined)

    await run(makeConfig({ telemetry: { endpoint: 'https://my.collector/v1/collect' } }), { send, writeState: vi.fn() })

    expect(send.mock.calls[0][1]).toBe('https://my.collector/v1/collect')
  })

  it.each([
    ['host Payload opt-out', { payloadTelemetry: false as const }],
    ['plugin telemetry:false', { telemetry: false as const }],
    ['DO_NOT_TRACK', { env: { DO_NOT_TRACK: '1' } }],
    ['CI', { env: { CI: 'true' } }],
    ['NODE_ENV=test', { env: { NODE_ENV: 'test' } }],
  ])('does not send when disabled by %s', async (_label, opts) => {
    const send = vi.fn().mockResolvedValue(undefined)
    const config = makeConfig('telemetry' in opts ? { telemetry: opts.telemetry } : {})
    const payload = makePayload('payloadTelemetry' in opts ? opts.payloadTelemetry : undefined)

    await reportTelemetry(
      { config, payload },
      { env: 'env' in opts ? opts.env : {}, readState: () => ({}), send, writeState: vi.fn() },
    )

    expect(send).not.toHaveBeenCalled()
  })

  it('does not send again the same UTC day (throttle)', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const now = new Date('2026-07-30T10:00:00Z')

    await run(makeConfig(), {
      now,
      readState: () => ({ lastSentDay: '2026-07-30', noticeShown: true }),
      send,
      writeState: vi.fn(),
    })

    expect(send).not.toHaveBeenCalled()
  })

  it('prints the notice only once across runs', async () => {
    const send = vi.fn().mockResolvedValue(undefined)

    await run(makeConfig(), { readState: () => ({ noticeShown: true }), send, writeState: vi.fn() })

    expect(info).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('never throws when sending rejects', async () => {
    const send = vi.fn().mockRejectedValue(new Error('boom'))

    await expect(run(makeConfig(), { send, writeState: vi.fn() })).resolves.toBeUndefined()
  })

  it('never throws when reading throttle state fails', async () => {
    const send = vi.fn().mockResolvedValue(undefined)

    await expect(
      run(makeConfig(), {
        readState: () => {
          throw new Error('fs down')
        },
        send,
        writeState: vi.fn(),
      }),
    ).resolves.toBeUndefined()
  })
})
