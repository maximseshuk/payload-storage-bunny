import { describe, expect, it, vi } from 'vitest'

import { postReport } from '@/server/telemetry/transport.js'
import type { TelemetryReport } from '@/server/telemetry/types.js'

const report = { product: 'payload-storage-bunny', schema: 1 } as unknown as TelemetryReport

describe('postReport', () => {
  it('POSTs the report JSON to the endpoint with an abort signal', async () => {
    const send = vi.fn().mockResolvedValue(undefined)

    await postReport(report, 'https://telemetry.example/v1/collect', { send })

    expect(send).toHaveBeenCalledTimes(1)
    const [url, options] = send.mock.calls[0]
    expect(url).toBe('https://telemetry.example/v1/collect')
    expect(options).toMatchObject({ json: report, method: 'post', retry: 0 })
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('never throws when the network / timeout fails', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network down'))

    await expect(postReport(report, 'https://telemetry.example/v1/collect', { send })).resolves.toBeUndefined()
  })
})
