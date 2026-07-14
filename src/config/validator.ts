import type { BunnyStorageConfig } from '@/types/config.js'
import type { NormalizedBunnyStorageConfig } from '@/types/configNormalized.js'

// TODO(v4): drop this deprecated-alias detection once v2 users have migrated.
type DeprecatedConfig = {
  adminThumbnail?: unknown
  purge?: boolean | { apiKey?: unknown }
  stream?: { tus?: boolean | { mimeTypes?: unknown } }
}

const findRemovedAliases = (original: BunnyStorageConfig): string[] => {
  const deprecated = original as DeprecatedConfig
  const messages: string[] = []

  if (deprecated.adminThumbnail !== undefined) {
    messages.push('"adminThumbnail" was removed in v3. Rename it to "thumbnail" (same shape).')
  }

  const tus = typeof deprecated.stream === 'object' ? deprecated.stream.tus : undefined
  if (typeof tus === 'object' && tus.mimeTypes !== undefined) {
    messages.push('"stream.tus.mimeTypes" was removed in v3. Move the array to "stream.mimeTypes".')
  }

  const purge = deprecated.purge
  if (typeof purge === 'object' && purge.apiKey !== undefined) {
    messages.push('"purge.apiKey" was removed in v3. Use the global `apiKey` instead.')
  }

  return messages
}

export const validateNormalizedConfig = (config: NormalizedBunnyStorageConfig) => {
  const removedAliases = findRemovedAliases(config._original)
  if (removedAliases.length > 0) {
    throw new Error(removedAliases.map((message) => `Config error: ${message}`).join('\n'))
  }

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

  if (config._original.purge && !config.apiKey) {
    errors.push('`purge` requires global `apiKey` to be provided')
  }

  if (config.storage) {
    if (config.storage.hostname.includes('storage.bunnycdn.com')) {
      errors.push('storage `hostname` cannot include "storage.bunnycdn.com"')
    }

    if (config.signedUrls && !config.storage.tokenSecurityKey) {
      errors.push('storage `tokenSecurityKey` is required when signed URLs are enabled')
    }

    if (config.storage.s3 && !config.storage.s3.region) {
      errors.push('storage `s3.region` is required when S3 mode is enabled')
    }
  }

  if (config.signedUrls && config.stream && !config.stream.tokenSecurityKey) {
    errors.push('stream `tokenSecurityKey` is required when signed URLs and stream are both enabled')
  }

  for (const [slug, collection] of config.collections) {
    const clientUploads = collection.clientUploads
    if (!clientUploads) {
      continue
    }

    if (!collection.storage) {
      errors.push(`collection "${slug}" enables \`clientUploads\` but Bunny Storage is not enabled for it`)
      continue
    }

    if (clientUploads.mode === 's3' && !collection.storage.s3) {
      errors.push(
        `collection "${slug}" uses \`clientUploads.mode: 's3'\` but \`storage.s3\` is not enabled; enable S3 or use \`mode: 'edge'\``,
      )
    }

    if (clientUploads.mode === 'edge' && (!clientUploads.edge?.scriptUrl || !clientUploads.edge?.secret)) {
      errors.push(
        `collection "${slug}" uses \`clientUploads.mode: 'edge'\` but is missing \`clientUploads.edge.scriptUrl\` or \`clientUploads.edge.secret\``,
      )
    }
  }

  if (config.stream) {
    const collectionsWithIssues: string[] = []

    for (const [slug, collection] of config.collections) {
      if (collection.disablePayloadAccessControl) {
        continue
      }

      const effectiveMp4Fallback = collection.stream?.mp4Fallback ?? config.stream.mp4Fallback

      const hasSignedUrlsWithRedirect =
        collection.signedUrls && collection.signedUrls.staticHandler?.useRedirect === true

      const hasValidAlternative = effectiveMp4Fallback || hasSignedUrlsWithRedirect

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
