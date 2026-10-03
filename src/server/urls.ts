import { buildStoragePathData } from '@payloadcms/plugin-cloud-storage/utilities'

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
