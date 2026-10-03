import type { NormalizedSignedUrlsConfig } from '@/shared/types/index.js'

export const signed = (over: Partial<NormalizedSignedUrlsConfig> = {}): NormalizedSignedUrlsConfig => ({
  expiresIn: () => 3600,
  ...over,
})
