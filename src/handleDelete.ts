import type { HandleDelete } from '@payloadcms/plugin-cloud-storage/types'

import ky, { HTTPError } from 'ky'
import { posix } from 'node:path'
import { APIError } from 'payload'

import type { BunnyAdapterOptions } from './types.js'

import { getGenerateURL } from './generateURL.js'
import { getStorageUrl, getVideoFromDoc, purgeBunnyCache } from './utils.js'

export const getHandleDelete = ({ purge, storage, stream }: BunnyAdapterOptions): HandleDelete => {
  return async ({ collection, doc, filename, req }) => {
    try {
      const video = getVideoFromDoc(doc, filename)

      let fileUrl: null | string = null
      if (!video && purge && purge.enabled) {
        fileUrl = await getGenerateURL({ storage, stream })({
          collection,
          data: doc,
          filename,
          prefix: doc.prefix || '',
        })
      }

      if (stream && video) {
        await ky.delete(
          `https://video.bunnycdn.com/library/${stream.libraryId}/videos/${video.videoId}`,
          {
            headers: {
              accept: 'application/json',
              AccessKey: stream.apiKey,
            },
            timeout: 120000,
          },
        )
      } else {
        const filePath = posix.join(doc.prefix || '', filename)

        await ky.delete(
          `https://${getStorageUrl(storage.region)}/${storage.zoneName}/${filePath}`,
          {
            headers: {
              accept: 'application/json',
              AccessKey: storage.apiKey,
            },
            timeout: 120000,
          },
        )

        if (purge && purge.enabled && fileUrl) {
          await purgeBunnyCache(fileUrl, purge, req)
        }
      }
    } catch (err) {
      if (err instanceof HTTPError) {
        const errorResponse = await err.response.text()

        req.payload.logger.error({
          error: {
            response: errorResponse,
            status: err.response.status,
            statusText: err.response.statusText,
          },
          file: { name: filename },
          storage: storage.zoneName,
        })
      }

      req.payload.logger.error({
        error: err,
        file: { name: filename },
        storage: storage.zoneName,
      })

      throw new APIError(`Error deleting file: ${filename}`, 500)
    }
  }
}