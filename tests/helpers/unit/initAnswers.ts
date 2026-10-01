import type { InitAnswers } from '@/cli/lib/plan.js'

export const initAnswers = (overrides: Partial<InitAnswers> = {}): InitAnswers => ({
  clientUploads: false,
  collectionSlug: 'media',
  deployEdge: false,
  optimizer: false,
  purge: false,
  region: 'de',
  service: 'both',
  signedUrls: false,
  storageAccess: 'http',
  storageReplication: [],
  storageTier: 'standard',
  storageZoneName: 'my-app',
  streamReplication: [],
  videoLibraryName: 'my-app-stream',
  ...overrides,
})
