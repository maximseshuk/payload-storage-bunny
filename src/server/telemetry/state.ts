import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type TelemetryState = {
  lastSentDay?: string
  noticeShown?: boolean
}

export const utcDay = (now: Date = new Date()): string => now.toISOString().slice(0, 10)

const stateFile = (projectId: string): string => join(tmpdir(), `payload-storage-bunny-telemetry-${projectId}.json`)

export const readState = (projectId: string): TelemetryState => {
  try {
    return JSON.parse(readFileSync(stateFile(projectId), 'utf8')) as TelemetryState
  } catch {
    return {}
  }
}

export const writeState = (projectId: string, state: TelemetryState): void => {
  try {
    writeFileSync(stateFile(projectId), JSON.stringify(state))
  } catch {}
}
