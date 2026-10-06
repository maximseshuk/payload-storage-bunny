import type {
  NormalizedBunnyStorageOptions,
  NormalizedStorageOptions,
  NormalizedStreamOptions,
} from '@/shared/types/optionsNormalized.js'

export const collectStreamOptions = (options: NormalizedBunnyStorageOptions): Map<number, NormalizedStreamOptions> => {
  const map = new Map<number, NormalizedStreamOptions>()

  const add = (stream: NormalizedStreamOptions | undefined) => {
    if (stream && !map.has(stream.libraryId)) {
      map.set(stream.libraryId, stream)
    }
  }

  add(options.stream)
  for (const collection of options.collections.values()) {
    add(collection.stream)
  }

  return map
}

export const collectStorageOptions = (options: NormalizedBunnyStorageOptions): NormalizedStorageOptions[] => {
  const map = new Map<string, NormalizedStorageOptions>()

  const add = (storage: NormalizedStorageOptions | undefined) => {
    if (storage && !map.has(storage.zoneName)) {
      map.set(storage.zoneName, storage)
    }
  }

  add(options.storage)
  for (const collection of options.collections.values()) {
    add(collection.storage)
  }

  return [...map.values()]
}

export const hasAnyStorage = (options: NormalizedBunnyStorageOptions): boolean =>
  collectStorageOptions(options).length > 0

export const hasAnyStreamTus = (options: NormalizedBunnyStorageOptions): boolean =>
  [options.stream, ...[...options.collections.values()].map((collection) => collection.stream)].some(
    (stream) => stream?.tus,
  )

export const hasAnyStreamCleanup = (options: NormalizedBunnyStorageOptions): boolean => {
  for (const stream of collectStreamOptions(options).values()) {
    if (stream.cleanup) {
      return true
    }
  }
  return false
}

export const collectWebhookSecrets = (options: NormalizedBunnyStorageOptions): Map<number, string> => {
  const secrets = new Map<number, string>()

  const add = (stream: NormalizedStreamOptions | undefined) => {
    if (stream?.webhook?.secret && !secrets.has(stream.libraryId)) {
      secrets.set(stream.libraryId, stream.webhook.secret)
    }
  }

  add(options.stream)
  for (const collection of options.collections.values()) {
    add(collection.stream)
  }

  return secrets
}
