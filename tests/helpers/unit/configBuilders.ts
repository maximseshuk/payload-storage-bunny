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
