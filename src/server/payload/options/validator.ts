import { collectStorageOptions } from '@/server/payload/options/inspect.js'
import { MAX_EXPIRES_IN_SECONDS } from '@/server/payload/tokenAuth.js'
import { PLUGIN_KEY } from '@/shared/constants.js'
import type { BunnyStorageOptions, SignedUrlsOptions } from '@/shared/types/options.js'
import type {
  NormalizedBunnyStorageOptions,
  NormalizedStorageOptions,
  NormalizedStreamOptions,
} from '@/shared/types/optionsNormalized.js'

const isNonEmptyString = (value: unknown): boolean => typeof value === 'string' && value.length > 0

type RemovedKey = {
  globalOnly?: boolean
  path: string
  renamed?: string
  use?: string
}

const REMOVED_KEYS: RemovedKey[] = [
  { globalOnly: true, path: 'apiKey', renamed: 'accountApiKey' },
  { globalOnly: true, path: 'i18n', use: "Payload's i18n.translations['@seshuk/payload-storage-bunny']" },
  { globalOnly: true, path: 'telemetry.endpoint', renamed: 'telemetry.url' },
  { path: 'adminThumbnail', renamed: 'thumbnail' },
  { path: 'purge.apiKey', use: 'the top-level accountApiKey' },
  { path: 'urlTransform.transformUrl', use: 'urlTransform: (args) => url' },
  { path: 'thumbnail.appendTimestamp', renamed: 'thumbnail.urlTransform.appendTimestamp' },
  { path: 'thumbnail.queryParams', renamed: 'thumbnail.urlTransform.queryParams' },
  { path: 'thumbnail.transformUrl', use: 'thumbnail.urlTransform: (args) => url' },
  { path: 'signedUrls.expiresAt', use: 'signedUrls.expiresIn as a function that returns a Date' },
  { path: 'signedUrls.staticHandler.useRedirect', use: 'signedUrls.staticHandler.redirect' },
  { path: 'signedUrls.staticHandler.redirectStatus', renamed: 'signedUrls.staticHandler.redirect.status' },
  { path: 'signedUrls.staticHandler.expiresIn', renamed: 'signedUrls.staticHandler.redirect.expiresIn' },
  { path: 'storage.s3.region', use: 'storage.region with storage.s3: true' },
  { path: 'stream.tus.checkAccess', renamed: 'stream.tus.access' },
  { path: 'stream.tus.mimeTypes', renamed: 'stream.mimeTypes' },
  { path: 'stream.tus.uploadTimeout', renamed: 'stream.tus.expiresIn' },
]

const readPath = (source: unknown, path: string): unknown => {
  let value = source
  for (const segment of path.split('.')) {
    if (typeof value !== 'object' || value === null) {
      return undefined
    }
    value = (value as Record<string, unknown>)[segment]
  }
  return value
}

const findRemovedKeys = (source: unknown, prefix: string, global: boolean): string[] =>
  REMOVED_KEYS.filter(({ globalOnly }) => global || !globalOnly).flatMap(({ path, renamed, use }) => {
    if (readPath(source, path) === undefined) {
      return []
    }
    const name = `${prefix}${path}`
    return [
      renamed ? `[${PLUGIN_KEY}] ${name} was renamed to ${renamed}` : `[${PLUGIN_KEY}] ${name} was removed, use ${use}`,
    ]
  })

export const assertNoRemovedKeys = (options: BunnyStorageOptions): void => {
  const messages = findRemovedKeys(options, '', true)

  for (const [slug, collection] of Object.entries(options.collections ?? {})) {
    messages.push(...findRemovedKeys(collection, `collections.${slug}.`, false))
  }

  if (messages.length > 0) {
    throw new Error(messages.join('\n'))
  }
}

const rawCollectionEnablesClientUploads = (original: BunnyStorageOptions, slug: string): boolean => {
  const globalEnabled = Boolean(original.storage?.clientUploads)
  const raw = original.collections[slug as keyof typeof original.collections]

  if (typeof raw !== 'object') {
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

export const validateNormalizedOptions = (options: NormalizedBunnyStorageOptions) => {
  const errors: string[] = []

  if (options.collections.size === 0) {
    errors.push('at least one collection must be configured')
  }

  const collectionsWithoutService: string[] = []
  for (const [slug, collection] of options.collections) {
    if (!collection.storage && !collection.stream) {
      collectionsWithoutService.push(slug)
    }
  }

  if (collectionsWithoutService.length > 0) {
    errors.push(
      `collections [${collectionsWithoutService.join(', ')}] must have at least one service enabled (storage or stream). `,
    )
  }

  if (options._original.purge && !options.accountApiKey) {
    errors.push('`purge` requires global `accountApiKey` to be provided')
  }

  if (!options.accountApiKey && !options._original.purge) {
    const collectionsWithPurge: string[] = []
    for (const [slug, collectionOptions] of Object.entries(options._original.collections)) {
      if (typeof collectionOptions === 'object' && collectionOptions.purge) {
        collectionsWithPurge.push(slug)
      }
    }

    if (collectionsWithPurge.length > 0) {
      errors.push(
        `collections [${collectionsWithPurge.join(', ')}] enable \`purge\` but global \`accountApiKey\` is not provided`,
      )
    }
  }

  const signedUrlsSources: [string, unknown][] = [
    ['signedUrls', options._original.signedUrls],
    ...Object.entries(options._original.collections).map(([slug, raw]): [string, unknown] => [
      `collections.${slug}.signedUrls`,
      typeof raw === 'object' ? raw.signedUrls : undefined,
    ]),
  ]
  for (const [path, signedUrls] of signedUrlsSources) {
    if (typeof signedUrls !== 'object' || signedUrls === null) {
      continue
    }
    const { expiresIn, staticHandler } = signedUrls as SignedUrlsOptions
    const redirect = typeof staticHandler?.redirect === 'object' ? staticHandler.redirect : undefined
    const expiries: [string, unknown][] = [
      [`${path}.expiresIn`, expiresIn],
      [`${path}.staticHandler.redirect.expiresIn`, redirect?.expiresIn],
    ]
    for (const [key, value] of expiries) {
      if (typeof value === 'number' && !(Number.isFinite(value) && value > 0 && value <= MAX_EXPIRES_IN_SECONDS)) {
        errors.push(
          `\`${key}\` must be more than 0 and at most ${MAX_EXPIRES_IN_SECONDS} seconds (10 years), got ${value}`,
        )
      }
    }
    if (redirect?.status !== undefined && redirect.status !== 302 && redirect.status !== 307) {
      errors.push(`\`${path}.staticHandler.redirect.status\` must be 302 or 307`)
    }
  }

  if (options._original.storage) {
    const storage = options._original.storage
    if (!isNonEmptyString(storage.apiKey)) {
      errors.push('global storage options are missing `apiKey`')
    }
    if (!isNonEmptyString(storage.hostname)) {
      errors.push('global storage options are missing `hostname`')
    }
    if (!isNonEmptyString(storage.zoneName)) {
      errors.push('global storage options are missing `zoneName`')
    }
  }

  if (options._original.stream) {
    const stream = options._original.stream
    if (!isNonEmptyString(stream.apiKey)) {
      errors.push('global stream options are missing `apiKey`')
    }
    if (!isNonEmptyString(stream.hostname)) {
      errors.push('global stream options are missing `hostname`')
    }
    if (typeof stream.libraryId !== 'number') {
      errors.push('global stream options are missing `libraryId`')
    }
  }

  for (const [slug, raw] of Object.entries(options._original.collections)) {
    if (typeof raw !== 'object') {
      continue
    }

    const rawStorage = raw.storage
    if (rawStorage && 'apiKey' in rawStorage) {
      if (!isNonEmptyString(rawStorage.apiKey)) {
        errors.push(`collection "${slug}" provides its own storage options but is missing \`apiKey\``)
      }
      if (!isNonEmptyString(rawStorage.hostname)) {
        errors.push(`collection "${slug}" provides its own storage options but is missing \`hostname\``)
      }
      if (!isNonEmptyString(rawStorage.zoneName)) {
        errors.push(`collection "${slug}" provides its own storage options but is missing \`zoneName\``)
      }
    }

    const rawStream = raw.stream
    if (rawStream && 'apiKey' in rawStream) {
      if (!isNonEmptyString(rawStream.apiKey)) {
        errors.push(`collection "${slug}" provides its own stream options but is missing \`apiKey\``)
      }
      if (!isNonEmptyString(rawStream.hostname)) {
        errors.push(`collection "${slug}" provides its own stream options but is missing \`hostname\``)
      }
      if (typeof rawStream.libraryId !== 'number') {
        errors.push(`collection "${slug}" provides its own stream options but is missing \`libraryId\``)
      }
    }
  }

  const storageSignedUrlIssues: string[] = []
  const streamSignedUrlIssues: string[] = []

  for (const [slug, collection] of options.collections) {
    if (collection.storage) {
      if (collection.storage.hostname.includes('storage.bunnycdn.com')) {
        errors.push(`collection "${slug}" storage \`hostname\` cannot include "storage.bunnycdn.com"`)
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

  for (const [slug, collection] of options.collections) {
    const clientUploads = collection.storage?.clientUploads

    if (!clientUploads) {
      if (rawCollectionEnablesClientUploads(options._original, slug)) {
        errors.push(`collection "${slug}" enables \`storage.clientUploads\` but Bunny Storage is not enabled for it`)
      }
      continue
    }

    if (!collection.storage?.s3 && (!clientUploads.edge?.scriptUrl || !clientUploads.edge?.secret)) {
      errors.push(
        `collection "${slug}" uses edge-transport client uploads (\`storage.s3\` is not \`true\`) but is missing \`storage.clientUploads.edge.scriptUrl\` or \`storage.clientUploads.edge.secret\``,
      )
    }
  }

  const secretsByScriptUrl = new Map<string, { secrets: Set<string>; zones: string[] }>()
  for (const storage of collectStorageOptions(options)) {
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

  for (const [slug, collection] of options.collections) {
    if (!collection.stream || collection.disablePayloadAccessControl) {
      continue
    }

    const effectiveMp4Fallback = collection.stream.mp4Fallback

    const hasSignedUrlsWithRedirect = Boolean(collection.signedUrls?.redirect)

    if (!effectiveMp4Fallback && !hasSignedUrlsWithRedirect) {
      collectionsWithIssues.push(slug)
    }
  }

  if (collectionsWithIssues.length > 0) {
    errors.push(
      `collections [${collectionsWithIssues.join(', ')}] with \`disablePayloadAccessControl: false\` require: ` +
        '1) `mp4Fallback` to be enabled, or ' +
        '2) signed URLs with `staticHandler.redirect` enabled (globally or per collection)',
    )
  }

  const streamApiKeys = new Map<number, string>()
  const streamConflicts = new Set<number>()
  const checkStreamConflict = (stream: NormalizedStreamOptions | undefined) => {
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
  const checkStorageConflict = (storage: NormalizedStorageOptions | undefined) => {
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
  const checkWebhookSecret = (stream: NormalizedStreamOptions | undefined) => {
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

  checkStreamConflict(options.stream)
  checkStorageConflict(options.storage)
  checkWebhookSecret(options.stream)

  for (const collection of options.collections.values()) {
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
      `Invalid Bunny Storage options: ${errors.join('; ')}. Check the documentation at: https://github.com/maximseshuk/payload-storage-bunny`,
    )
  }
}
