import { buildStoragePathData } from '@payloadcms/plugin-cloud-storage/utilities'

type StoredRepresentation = {
  _objectKey?: unknown
  original?: { filename?: unknown }
  prefix?: unknown
}

export const getObjectFolder = (doc: unknown, representation: unknown = doc): string => {
  const stored = (doc ?? {}) as StoredRepresentation
  const file = (representation ?? {}) as StoredRepresentation
  const isLegacy = typeof stored.original?.filename !== 'string'
  return [
    file.prefix ?? (isLegacy ? stored.prefix : undefined),
    file._objectKey ?? (isLegacy ? stored._objectKey : undefined),
  ]
    .filter((segment): segment is string => typeof segment === 'string' && segment.length > 0)
    .join('/')
}

type StorageCdnUrlArgs = {
  collectionPrefix?: string
  encode?: boolean
  filename: string
  hostname: string
  prefix?: string
}

export const buildStorageCdnUrl = ({
  collectionPrefix,
  encode = false,
  filename,
  hostname,
  prefix,
}: StorageCdnUrlArgs): string => {
  const { storageFilePath } = buildStoragePathData({ collectionPrefix, docPrefix: prefix, filename })
  return `https://${hostname}/${encode ? encodeURI(storageFilePath) : storageFilePath}`
}

export const buildStoragePurgeUrl = (args: Omit<StorageCdnUrlArgs, 'encode'>): string =>
  `${buildStorageCdnUrl({ ...args, encode: true })}*`

export const buildStreamCdnUrl = (hostname: string, videoId: string, asset: string): string => {
  return `https://${hostname}/${videoId}/${asset}`
}
