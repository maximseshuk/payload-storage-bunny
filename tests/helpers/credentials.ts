const hasEnv = (...keys: string[]): boolean => keys.every((key) => Boolean(process.env[key]))

export const hasBunnyCredentials = (): boolean =>
  hasEnv(
    'BUNNY_API_KEY',
    'BUNNY_STORAGE_API_KEY',
    'BUNNY_STORAGE_ZONE_NAME',
    'BUNNY_STORAGE_HOSTNAME',
    'BUNNY_STREAM_API_KEY',
    'BUNNY_STREAM_LIBRARY_ID',
    'BUNNY_STREAM_HOSTNAME',
  )

export const hasSignedBunnyCredentials = (): boolean =>
  hasEnv(
    'BUNNY_SIGNED_STORAGE_API_KEY',
    'BUNNY_SIGNED_STORAGE_ZONE_NAME',
    'BUNNY_SIGNED_STORAGE_HOSTNAME',
    'BUNNY_SIGNED_STORAGE_TOKEN_SECURITY_KEY',
    'BUNNY_SIGNED_STREAM_API_KEY',
    'BUNNY_SIGNED_STREAM_LIBRARY_ID',
    'BUNNY_SIGNED_STREAM_HOSTNAME',
    'BUNNY_SIGNED_STREAM_TOKEN_SECURITY_KEY',
  )
