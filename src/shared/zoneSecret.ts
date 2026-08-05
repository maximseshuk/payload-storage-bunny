export const ZONE_SECRET_PREFIX = 'ZONE_'

export const ZONE_SECRET_PATTERN = /^ZONE_[A-Z0-9_]+$/

export const zoneSecretName = (zoneName: string): string =>
  ZONE_SECRET_PREFIX + zoneName.toUpperCase().replaceAll('-', '_')
