import type { HandleUpload } from '@payloadcms/plugin-cloud-storage/types'

import ky, { HTTPError } from 'ky'
import { posix } from 'node:path'
import { APIError } from 'payload'

import type { BunnyAdapterOptions } from './types.js'

import { getGenerateURL } from './generateURL.js'
import { getStorageUrl, purgeBunnyCache } from './utils.js'

type Args = { prefix?: string } & BunnyAdapterOptions

export const getHandleUpload = ({ prefix, purge, storage, stream }: Args): HandleUpload => {
  return async ({ collection, data, file, req }) => {
    data.url = null
    data.thumbnailURL = null

    try {
      const fileName = file.filename
      const filePath = posix.join(prefix || '', fileName)
      const isVideoFile = file.mimeType.startsWith('video/')

      if (stream && isVideoFile) {
        const { guid } = await ky
          .post<{ guid: string }>(`https://video.bunnycdn.com/library/${stream.libraryId}/videos`, {
            headers: {
              accept: 'application/json',
              AccessKey: stream.apiKey,
              'content-type': 'application/json',
            },
            json: { thumbnailTime: stream.thumbnailTime, title: fileName },
            timeout: 120000,
          })
          .json()

        await ky.put(`https://video.bunnycdn.com/library/${stream.libraryId}/videos/${guid}`, {
          body: file.buffer,
          headers: {
            accept: 'application/json',
            AccessKey: stream.apiKey,
          },
          timeout: 120000,
        })

        data.bunnyVideoId = guid
      } else {
        await ky.put(`https://${getStorageUrl(storage.region)}/${storage.zoneName}/${filePath}`, {
          body: file.buffer,
          headers: {
            accept: 'application/json',
            AccessKey: storage.apiKey,
            'content-type': file.mimeType,
          },
          timeout: 120000,
        })

        data.bunnyVideoId = null

        if (purge && purge.enabled) {
          const url = await getGenerateURL({ storage, stream })({ collection, data, filename: fileName, prefix: prefix || '' })
          await purgeBunnyCache(url, purge, req)
        }
      }

      return data
    } catch (err: unknown) {
      if (err instanceof HTTPError) {
        const errorResponse = await err.response.text()

        req.payload.logger.error({
          error: {
            response: errorResponse,
            status: err.response.status,
            statusText: err.response.statusText,
          },
          file: {
            name: file.filename,
            type: file.mimeType,
            size: file.filesize,
          },
          storage: storage.zoneName,
        })
      } else {
        req.payload.logger.error({
          error: err,
          file: {
            name: file.filename,
            type: file.mimeType,
            size: file.filesize,
          },
          storage: storage.zoneName,
        })
      }

      throw new APIError(`Error uploading file: ${file.filename}.`, 500)
    }
  }
}