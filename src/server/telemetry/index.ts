import {
  reportTelemetry as reportToolingTelemetry,
  type ReportTelemetryDeps,
} from '@seshuk/payload-plugin-tooling/telemetry'
import type { Payload } from 'payload'

import type { NormalizedBunnyStorageConfig } from '@/shared/types/configNormalized.js'

import { buildFeatures } from './features.js'

export const reportTelemetry = async (
  { config, payload }: { config: NormalizedBunnyStorageConfig; payload: Payload },
  deps?: ReportTelemetryDeps,
): Promise<void> =>
  reportToolingTelemetry(
    {
      disableEnv: 'BUNNY_TELEMETRY_DISABLED',
      docsUrl: 'https://payload-storage-bunny.seshuk.im/v4/configuration/telemetry',
      features: buildFeatures(config),
      option: config._original.telemetry,
      packageName: '@seshuk/payload-storage-bunny',
      payload,
      product: 'payload-storage-bunny',
    },
    deps,
  )
