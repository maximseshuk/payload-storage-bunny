import { httpSend } from '@/server/http/index.js'

import { TELEMETRY_TIMEOUT_MS } from './constants.js'
import type { TelemetryReport } from './types.js'

export const postReport = async (
  report: TelemetryReport,
  endpoint: string,
  { send = httpSend, timeoutMs = TELEMETRY_TIMEOUT_MS }: { send?: typeof httpSend; timeoutMs?: number } = {},
): Promise<void> => {
  try {
    await send(endpoint, {
      json: report,
      method: 'post',
      retry: 0,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {}
}
