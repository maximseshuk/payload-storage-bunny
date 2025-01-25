import type { GenerateURL } from '@payloadcms/plugin-cloud-storage/types'

import { posix } from 'node:path'

import type { BunnyAdapterOptions } from './types.js'

export const getGenerateURL = ({ storage, stream }: BunnyAdapterOptions): GenerateURL => {
  return ({ data, filename, prefix = '' }) => {
    if (stream && data.bunnyVideoId) {
      return `https://${stream.hostname}/${data.bunnyVideoId}/playlist.m3u8`
    }

    return `https://${storage.hostname}/${posix.join(prefix, filename)}`
  }
}
