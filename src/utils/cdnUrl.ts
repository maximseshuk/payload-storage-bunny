import { posix } from 'node:path'

export const buildStorageCdnUrl = (hostname: string, prefix: string, filename: string, encode = false): string => {
  const path = posix.join(prefix, filename)
  return `https://${hostname}/${encode ? encodeURI(path) : path}`
}

export const buildStreamCdnUrl = (hostname: string, videoId: string, asset: string): string => {
  return `https://${hostname}/${videoId}/${asset}`
}
