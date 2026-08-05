import type { BunnyStorageConfig } from '@/shared/types/config.js'

const isTruthyEnv = (value: string | undefined): boolean =>
  value !== undefined && value !== '' && value !== '0' && value.toLowerCase() !== 'false'

export const isTelemetryDisabled = ({
  env,
  payloadTelemetry,
  plugin,
}: {
  env: Record<string, string | undefined>
  payloadTelemetry?: boolean
  plugin: BunnyStorageConfig['telemetry']
}): boolean => {
  if (payloadTelemetry === false) {
    return true
  }

  if (plugin === false) {
    return true
  }

  if (isTruthyEnv(env.BUNNY_TELEMETRY_DISABLED) || isTruthyEnv(env.DO_NOT_TRACK)) {
    return true
  }

  if (isTruthyEnv(env.CI)) {
    return true
  }

  return env.NODE_ENV === 'test'
}
