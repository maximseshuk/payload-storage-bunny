export const createBaseStorage = (overrides: Record<string, unknown> = {}) => ({
  apiKey: 'storage-key',
  hostname: 'storage.bunny.net',
  tokenSecurityKey: 'token-key',
  zoneName: 'test-zone',
  ...overrides,
})

export const createBaseStream = () => ({
  apiKey: 'stream-key',
  hostname: 'stream.bunny.net',
  libraryId: 12345,
  tokenSecurityKey: 'stream-token',
})

export const createOwnStorage = (slugSuffix = 'own', overrides: Record<string, unknown> = {}) => ({
  apiKey: `own-storage-key-${slugSuffix}`,
  hostname: `own-${slugSuffix}.b-cdn.net`,
  zoneName: `own-zone-${slugSuffix}`,
  ...overrides,
})

export const createOwnStream = (libraryId = 999, overrides: Record<string, unknown> = {}) => ({
  apiKey: `own-stream-key-${libraryId}`,
  hostname: `own-stream-${libraryId}.b-cdn.net`,
  libraryId,
  ...overrides,
})
