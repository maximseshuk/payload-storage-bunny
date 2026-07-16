import { collectStorageConfigs } from '@/config/inspect.js'
import type { BunnyStorageConfig } from '@/types/config.js'
import type {
  NormalizedBunnyStorageConfig,
  NormalizedStorageConfig,
  NormalizedStreamConfig,
} from '@/types/configNormalized.js'

const isNonEmptyString = (value: unknown): boolean => typeof value === 'string' && value.length > 0

// TODO(v4): drop this deprecated-alias detection once v2 users have migrated.
type DeprecatedConfig = {
  adminThumbnail?: unknown
  apiKey?: unknown
  clientUploads?: boolean | { mode?: unknown }
  collections?: Record<
    string,
    | boolean
    | {
        clientUploads?: boolean | { mode?: unknown }
        storage?: boolean | { clientUploads?: boolean | { mode?: unknown } }
      }
  >
  purge?: boolean | { apiKey?: unknown }
  storage?: { clientUploads?: boolean | { mode?: unknown } }
  stream?: { tus?: boolean | { mimeTypes?: unknown; uploadTimeout?: unknown } }
}

const hasClientUploadsMode = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && (value as { mode?: unknown }).mode !== undefined

const findRemovedAliases = (original: BunnyStorageConfig): string[] => {
  const deprecated = original as DeprecatedConfig
  const messages: string[] = []

  if (deprecated.adminThumbnail !== undefined) {
    messages.push('"adminThumbnail" was removed in v3. Rename it to "thumbnail" (same shape).')
  }

  if (deprecated.apiKey !== undefined) {
    messages.push('"apiKey" was removed in v3. Rename it to "accountApiKey".')
  }

  const tus = typeof deprecated.stream === 'object' ? deprecated.stream.tus : undefined
  if (typeof tus === 'object' && tus.mimeTypes !== undefined) {
    messages.push('"stream.tus.mimeTypes" was removed in v3. Move the array to "stream.mimeTypes".')
  }

  if (typeof tus === 'object' && tus.uploadTimeout !== undefined) {
    messages.push(
      `"stream.tus.uploadTimeout" was removed in v3. Rename it to "stream.tus.expiresIn" (it's a session expiry in seconds).`,
    )
  }

  const purge = deprecated.purge
  if (typeof purge === 'object' && purge.apiKey !== undefined) {
    messages.push('"purge.apiKey" was removed in v3. Use the global `accountApiKey` instead.')
  }

  if (deprecated.clientUploads !== undefined) {
    messages.push('"clientUploads" was moved in v3. Nest it under "storage.clientUploads".')
  }

  const modeSources: unknown[] = [deprecated.clientUploads, deprecated.storage?.clientUploads]

  for (const [slug, collection] of Object.entries(deprecated.collections ?? {})) {
    if (typeof collection !== 'object' || collection === null) {
      continue
    }

    if (collection.clientUploads !== undefined) {
      messages.push(
        `Per-collection "clientUploads" was moved in v3 (collection "${slug}"). Nest it under "storage.clientUploads".`,
      )
      modeSources.push(collection.clientUploads)
    }

    if (typeof collection.storage === 'object' && collection.storage !== null) {
      modeSources.push(collection.storage.clientUploads)
    }
  }

  if (modeSources.some(hasClientUploadsMode)) {
    messages.push(
      `"clientUploads.mode" was removed in v3 — the transport is chosen automatically ('s3' when "storage.s3" is set, otherwise 'edge').`,
    )
  }

  return messages
}

const rawCollectionEnablesClientUploads = (original: BunnyStorageConfig, slug: string): boolean => {
  const globalEnabled = Boolean(original.storage?.clientUploads)
  const raw = original.collections[slug as keyof typeof original.collections]

  if (raw === undefined || raw === true) {
    return globalEnabled
  }

  const storageOverride = raw.storage
  if (storageOverride === false) {
    return false
  }
  if (storageOverride && 'apiKey' in storageOverride) {
    return Boolean(storageOverride.clientUploads)
  }

  const collectionClientUploads = storageOverride?.clientUploads
  if (collectionClientUploads === false) {
    return false
  }
  if (collectionClientUploads === undefined) {
    return globalEnabled
  }
  return Boolean(collectionClientUploads)
}

export const validateNormalizedConfig = (config: NormalizedBunnyStorageConfig) => {
  const removedAliases = findRemovedAliases(config._original)
  if (removedAliases.length > 0) {
    throw new Error(removedAliases.map((message) => `Config error: ${message}`).join('\n'))
  }

  const errors: string[] = []

  if (config.collections.size === 0) {
    errors.push('at least one collection must be configured')
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

  if (config._original.purge && !config.accountApiKey) {
    errors.push('`purge` requires global `accountApiKey` to be provided')
  }

  if (!config.accountApiKey && !config._original.purge) {
    const collectionsWithPurge: string[] = []
    for (const [slug, collectionConfig] of Object.entries(config._original.collections)) {
      if (collectionConfig && collectionConfig !== true && collectionConfig.purge) {
        collectionsWithPurge.push(slug)
      }
    }

    if (collectionsWithPurge.length > 0) {
      errors.push(
        `collections [${collectionsWithPurge.join(', ')}] enable \`purge\` but global \`accountApiKey\` is not provided`,
      )
    }
  }

  if (config._original.storage) {
    const storage = config._original.storage
    if (!isNonEmptyString(storage.apiKey)) {
      errors.push('global storage config is missing `apiKey`')
    }
    if (!isNonEmptyString(storage.hostname)) {
      errors.push('global storage config is missing `hostname`')
    }
    if (!isNonEmptyString(storage.zoneName)) {
      errors.push('global storage config is missing `zoneName`')
    }
  }

  if (config._original.stream) {
    const stream = config._original.stream
    if (!isNonEmptyString(stream.apiKey)) {
      errors.push('global stream config is missing `apiKey`')
    }
    if (!isNonEmptyString(stream.hostname)) {
      errors.push('global stream config is missing `hostname`')
    }
    if (typeof stream.libraryId !== 'number') {
      errors.push('global stream config is missing `libraryId`')
    }
  }

  for (const [slug, raw] of Object.entries(config._original.collections)) {
    if (!raw || raw === true) {
      continue
    }

    const rawStorage = raw.storage
    if (rawStorage && 'apiKey' in rawStorage) {
      if (!isNonEmptyString(rawStorage.apiKey)) {
        errors.push(`collection "${slug}" provides its own storage config but is missing \`apiKey\``)
      }
      if (!isNonEmptyString(rawStorage.hostname)) {
        errors.push(`collection "${slug}" provides its own storage config but is missing \`hostname\``)
      }
      if (!isNonEmptyString(rawStorage.zoneName)) {
        errors.push(`collection "${slug}" provides its own storage config but is missing \`zoneName\``)
      }
    }

    const rawStream = raw.stream
    if (rawStream && 'apiKey' in rawStream) {
      if (!isNonEmptyString(rawStream.apiKey)) {
        errors.push(`collection "${slug}" provides its own stream config but is missing \`apiKey\``)
      }
      if (!isNonEmptyString(rawStream.hostname)) {
        errors.push(`collection "${slug}" provides its own stream config but is missing \`hostname\``)
      }
      if (typeof rawStream.libraryId !== 'number') {
        errors.push(`collection "${slug}" provides its own stream config but is missing \`libraryId\``)
      }
    }
  }

  const storageSignedUrlIssues: string[] = []
  const streamSignedUrlIssues: string[] = []

  for (const [slug, collection] of config.collections) {
    if (collection.storage) {
      if (collection.storage.hostname.includes('storage.bunnycdn.com')) {
        errors.push(`collection "${slug}" storage \`hostname\` cannot include "storage.bunnycdn.com"`)
      }

      if (collection.storage.s3 && !collection.storage.s3.region) {
        errors.push(`collection "${slug}" storage \`s3.region\` is required when S3 mode is enabled`)
      }

      if (collection.signedUrls && !collection.storage.tokenSecurityKey) {
        storageSignedUrlIssues.push(slug)
      }
    }

    if (collection.stream && collection.signedUrls && !collection.stream.tokenSecurityKey) {
      streamSignedUrlIssues.push(slug)
    }
  }

  if (storageSignedUrlIssues.length > 0) {
    errors.push(
      `collections [${storageSignedUrlIssues.join(', ')}] enable \`signedUrls\` but storage \`tokenSecurityKey\` is not provided`,
    )
  }

  if (streamSignedUrlIssues.length > 0) {
    errors.push(
      `collections [${streamSignedUrlIssues.join(', ')}] enable \`signedUrls\` but stream \`tokenSecurityKey\` is not provided`,
    )
  }

  for (const [slug, collection] of config.collections) {
    const clientUploads = collection.storage?.clientUploads

    if (!clientUploads) {
      if (rawCollectionEnablesClientUploads(config._original, slug)) {
        errors.push(`collection "${slug}" enables \`storage.clientUploads\` but Bunny Storage is not enabled for it`)
      }
      continue
    }

    if (!collection.storage?.s3 && (!clientUploads.edge?.scriptUrl || !clientUploads.edge?.secret)) {
      errors.push(
        `collection "${slug}" uses edge-transport client uploads (no \`storage.s3\`) but is missing \`storage.clientUploads.edge.scriptUrl\` or \`storage.clientUploads.edge.secret\``,
      )
    }
  }

  const secretsByScriptUrl = new Map<string, { secrets: Set<string>; zones: string[] }>()
  for (const storage of collectStorageConfigs(config)) {
    const edge = storage.clientUploads?.edge
    if (!edge?.scriptUrl || !edge.secret) {
      continue
    }
    const entry = secretsByScriptUrl.get(edge.scriptUrl) ?? { secrets: new Set<string>(), zones: [] }
    entry.secrets.add(edge.secret)
    entry.zones.push(storage.zoneName)
    secretsByScriptUrl.set(edge.scriptUrl, entry)
  }

  for (const { secrets, zones } of secretsByScriptUrl.values()) {
    if (secrets.size > 1) {
      errors.push(
        `storage zones [${zones.join(', ')}] share \`clientUploads.edge.scriptUrl\` but configure different \`secret\` values — all zones behind one Edge Script must use its one shared secret`,
      )
    }
  }

  const collectionsWithIssues: string[] = []

  for (const [slug, collection] of config.collections) {
    if (!collection.stream || collection.disablePayloadAccessControl) {
      continue
    }

    const effectiveMp4Fallback = collection.stream.mp4Fallback

    const hasSignedUrlsWithRedirect = collection.signedUrls && collection.signedUrls.staticHandler?.useRedirect === true

    if (!effectiveMp4Fallback && !hasSignedUrlsWithRedirect) {
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

  const streamApiKeys = new Map<number, string>()
  const streamConflicts = new Set<number>()
  const checkStreamConflict = (stream: NormalizedStreamConfig | undefined) => {
    if (!stream) {
      return
    }
    const existing = streamApiKeys.get(stream.libraryId)
    if (existing === undefined) {
      streamApiKeys.set(stream.libraryId, stream.apiKey)
    } else if (existing !== stream.apiKey) {
      streamConflicts.add(stream.libraryId)
    }
  }

  const storageApiKeys = new Map<string, string>()
  const storageConflicts = new Set<string>()
  const checkStorageConflict = (storage: NormalizedStorageConfig | undefined) => {
    if (!storage) {
      return
    }
    const existing = storageApiKeys.get(storage.zoneName)
    if (existing === undefined) {
      storageApiKeys.set(storage.zoneName, storage.apiKey)
    } else if (existing !== storage.apiKey) {
      storageConflicts.add(storage.zoneName)
    }
  }

  let webhookSecretIssue = false
  const webhookSecretsByLibrary = new Map<number, string>()
  const webhookConflicts = new Set<number>()
  const checkWebhookSecret = (stream: NormalizedStreamConfig | undefined) => {
    if (!stream?.webhook) {
      return
    }
    if (!isNonEmptyString(stream.webhook.secret)) {
      webhookSecretIssue = true
      return
    }
    const existing = webhookSecretsByLibrary.get(stream.libraryId)
    if (existing === undefined) {
      webhookSecretsByLibrary.set(stream.libraryId, stream.webhook.secret)
    } else if (existing !== stream.webhook.secret) {
      webhookConflicts.add(stream.libraryId)
    }
  }

  checkStreamConflict(config.stream)
  checkStorageConflict(config.storage)
  checkWebhookSecret(config.stream)

  for (const collection of config.collections.values()) {
    checkStreamConflict(collection.stream)
    checkStorageConflict(collection.storage)
    checkWebhookSecret(collection.stream)
  }

  for (const libraryId of streamConflicts) {
    errors.push(`stream library ${libraryId} is configured with conflicting API keys across collections`)
  }

  for (const zoneName of storageConflicts) {
    errors.push(`storage zone ${zoneName} is configured with conflicting API keys across collections`)
  }

  for (const libraryId of webhookConflicts) {
    errors.push(`stream library ${libraryId} is configured with conflicting webhook secrets across collections`)
  }

  if (webhookSecretIssue) {
    errors.push('stream `webhook.secret` must be a non-empty string')
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid Bunny Storage configuration: ${errors.join('; ')}. Check the documentation at: https://github.com/maximseshuk/payload-storage-bunny`,
    )
  }
}
