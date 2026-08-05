import type {
  NormalizedBunnyStorageConfig,
  NormalizedStorageConfig,
  NormalizedStreamConfig,
} from '@/shared/types/configNormalized.js'

export const collectStreamConfigs = (config: NormalizedBunnyStorageConfig): Map<number, NormalizedStreamConfig> => {
  const map = new Map<number, NormalizedStreamConfig>()

  const add = (stream: NormalizedStreamConfig | undefined) => {
    if (stream && !map.has(stream.libraryId)) {
      map.set(stream.libraryId, stream)
    }
  }

  add(config.stream)
  for (const collection of config.collections.values()) {
    add(collection.stream)
  }

  return map
}

export const collectStorageConfigs = (config: NormalizedBunnyStorageConfig): NormalizedStorageConfig[] => {
  const map = new Map<string, NormalizedStorageConfig>()

  const add = (storage: NormalizedStorageConfig | undefined) => {
    if (storage && !map.has(storage.zoneName)) {
      map.set(storage.zoneName, storage)
    }
  }

  add(config.storage)
  for (const collection of config.collections.values()) {
    add(collection.storage)
  }

  return [...map.values()]
}

export const hasAnyStorage = (config: NormalizedBunnyStorageConfig): boolean => collectStorageConfigs(config).length > 0

export const hasAnyStreamTus = (config: NormalizedBunnyStorageConfig): boolean => {
  for (const stream of collectStreamConfigs(config).values()) {
    if (stream.tus) {
      return true
    }
  }
  return false
}

export const hasAnyStreamCleanup = (config: NormalizedBunnyStorageConfig): boolean => {
  for (const stream of collectStreamConfigs(config).values()) {
    if (stream.cleanup) {
      return true
    }
  }
  return false
}

export const collectWebhookSecrets = (config: NormalizedBunnyStorageConfig): Map<number, string> => {
  const secrets = new Map<number, string>()

  const add = (stream: NormalizedStreamConfig | undefined) => {
    if (stream?.webhook?.secret && !secrets.has(stream.libraryId)) {
      secrets.set(stream.libraryId, stream.webhook.secret)
    }
  }

  add(config.stream)
  for (const collection of config.collections.values()) {
    add(collection.stream)
  }

  return secrets
}
