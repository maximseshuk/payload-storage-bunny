import type { NormalizedSignedUrlsOptions } from '@/shared/types/index.js'

export const signed = (over: Partial<NormalizedSignedUrlsOptions> = {}): NormalizedSignedUrlsOptions => ({
  expiresIn: () => 3600,
  ...over,
})
