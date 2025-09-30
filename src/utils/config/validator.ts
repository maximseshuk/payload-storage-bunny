import type { NormalizedBunnyStorageConfig } from '@/types/configNormalized.js'

export const validateNormalizedConfig = (config: NormalizedBunnyStorageConfig) => {
  const errors: string[] = []

  if (!config.storage && !config.stream) {
    errors.push('either `storage` or `stream` configuration must be provided')
  }

  const collectionsWithoutService: string[] = []
  for (const [slug, collection] of config.collections) {
    if (!collection.storage && !collection.stream) {
      collectionsWithoutService.push(slug)
    }
  }

  if (collectionsWithoutService.length > 0) {
    errors.push(
      `collections [${collectionsWithoutService.join(', ')}] must have at least one service enabled (storage or stream). `,
    )
  }

  const purge = config._original.purge
  if (purge) {
    const purgeApiKey = typeof purge === 'object' ? purge.apiKey : undefined
    if (!config.apiKey && !purgeApiKey) {
      errors.push('`purge` requires global `apiKey` to be provided')
    }
  }

  if (config.storage) {
    if (config.storage.hostname.includes('storage.bunnycdn.com')) {
      errors.push('storage `hostname` cannot include "storage.bunnycdn.com"')
    }

    if (config.signedUrls && !config.storage.tokenSecurityKey) {
      errors.push('storage `tokenSecurityKey` is required when signed URLs are enabled')
    }
  }

  if (config.signedUrls && config.stream && !config.stream.tokenSecurityKey) {
    errors.push('stream `tokenSecurityKey` is required when signed URLs and stream are both enabled')
  }

  if (config.stream) {
    const collectionsWithIssues: string[] = []

    for (const [slug, collection] of config.collections) {
      if (collection.disablePayloadAccessControl) {
        continue
      }

      const effectiveMp4Fallback = collection.stream?.mp4Fallback ?? config.stream.mp4Fallback

      const hasSignedUrlsWithRedirect =
        collection.signedUrls &&
        collection.signedUrls.staticHandler?.useRedirect === true

      const hasValidAlternative =
        effectiveMp4Fallback ||
        hasSignedUrlsWithRedirect

      if (!hasValidAlternative) {
        collectionsWithIssues.push(slug)
      }
    }

    if (collectionsWithIssues.length > 0) {
      errors.push(
        `collections [${collectionsWithIssues.join(', ')}] with \`disablePayloadAccessControl: false\` require: ` +
        '1) `mp4Fallback` to be enabled, or ' +
        '2) signed URLs with `staticHandler.useRedirect` enabled (globally or per collection)',
      )
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid Bunny Storage configuration: ${errors.join('; ')}. Check the documentation at: https://github.com/maximseshuk/payload-storage-bunny`,
    )
  }
}
