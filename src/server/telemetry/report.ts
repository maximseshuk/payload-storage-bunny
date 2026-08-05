import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { TELEMETRY_PRODUCT, TELEMETRY_SCHEMA } from './constants.js'
import type { ProjectIdSource, TelemetryFeatures, TelemetryReport } from './types.js'

export const buildReport = ({
  features,
  payloadVersion,
  productVersion,
  projectId,
  projectIdSource,
}: {
  features: TelemetryFeatures
  payloadVersion: string
  productVersion: string
  projectId: string
  projectIdSource: ProjectIdSource
}): TelemetryReport => ({
  features,
  os: process.platform.toLowerCase().slice(0, 16),
  payloadVersion,
  product: TELEMETRY_PRODUCT,
  productVersion,
  projectId,
  projectIdSource,
  runtime: 'node',
  runtimeVersion: process.versions.node.split('.')[0],
  schema: TELEMETRY_SCHEMA,
})

const nodeRequire = createRequire(import.meta.url)

const readJson = (file: string): { name?: string; version?: string } | undefined => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as { name?: string; version?: string }
  } catch {
    return undefined
  }
}

export const readPluginVersion = (): string =>
  readJson(join(dirname(fileURLToPath(import.meta.url)), '../../../package.json'))?.version ?? '0.0.0'

export const readPayloadVersion = (): string => {
  try {
    let dir = dirname(nodeRequire.resolve('payload'))
    for (let depth = 0; depth < 8; depth++) {
      const pkg = readJson(join(dir, 'package.json'))
      if (pkg?.name === 'payload' && pkg.version) {
        return pkg.version
      }
      const parent = dirname(dir)
      if (parent === dir) {
        break
      }
      dir = parent
    }
  } catch {}
  return '0.0.0'
}
