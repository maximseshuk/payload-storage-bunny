import type { Payload } from 'payload'

import type { BunnyStorageConfig } from '@/shared/types/config.js'
import type { NormalizedBunnyStorageConfig } from '@/shared/types/configNormalized.js'

import { isTelemetryDisabled } from './consent.js'
import { TELEMETRY_ENDPOINT } from './constants.js'
import { buildFeatures } from './features.js'
import { printNotice } from './notice.js'
import { deriveProjectId } from './projectId.js'
import { buildReport, readPayloadVersion, readPluginVersion } from './report.js'
import { readState, type TelemetryState, utcDay, writeState } from './state.js'
import { postReport } from './transport.js'
import type { TelemetryReport } from './types.js'

const resolveEndpoint = (telemetry: BunnyStorageConfig['telemetry']): string =>
  typeof telemetry === 'object' && telemetry.endpoint ? telemetry.endpoint : TELEMETRY_ENDPOINT

type ReportTelemetryDeps = {
  env?: Record<string, string | undefined>
  now?: Date
  readState?: (projectId: string) => TelemetryState
  send?: (report: TelemetryReport, endpoint: string) => Promise<void>
  writeState?: (projectId: string, state: TelemetryState) => void
}

export const reportTelemetry = async (
  { config, payload }: { config: NormalizedBunnyStorageConfig; payload: Payload },
  deps: ReportTelemetryDeps = {},
): Promise<void> => {
  const env = deps.env ?? process.env
  const readStateImpl = deps.readState ?? readState
  const writeStateImpl = deps.writeState ?? writeState
  const send = deps.send ?? postReport

  try {
    const telemetry = config._original.telemetry

    if (isTelemetryDisabled({ env, payloadTelemetry: payload.config.telemetry, plugin: telemetry })) {
      return
    }

    const { projectId, projectIdSource } = deriveProjectId({
      secret: payload.secret,
      serverURL: payload.config.serverURL,
    })

    const state = readStateImpl(projectId)
    const today = utcDay(deps.now)

    if (!state.noticeShown) {
      printNotice(payload.logger)
    }

    if (state.lastSentDay === today) {
      if (!state.noticeShown) {
        writeStateImpl(projectId, { ...state, noticeShown: true })
      }
      return
    }

    const report = buildReport({
      features: buildFeatures(config),
      payloadVersion: readPayloadVersion(),
      productVersion: readPluginVersion(),
      projectId,
      projectIdSource,
    })

    writeStateImpl(projectId, { lastSentDay: today, noticeShown: true })

    await send(report, resolveEndpoint(telemetry))
  } catch {
    // telemetry must never affect the host application.
  }
}
