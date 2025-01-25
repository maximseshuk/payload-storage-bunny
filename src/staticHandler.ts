import type { StaticHandler } from '@payloadcms/plugin-cloud-storage/types'
import type { CollectionConfig } from 'payload'

import ky, { HTTPError } from 'ky'
import { posix } from 'node:path'

import type { BunnyAdapterOptions } from './types.js'

import { getStorageUrl, getVideoId } from './utils.js'

type Args = { collection: CollectionConfig; prefix?: string } & BunnyAdapterOptions

export const getStaticHandler = ({
  collection,
  prefix = '',
  storage,
  stream,
}: Args): StaticHandler => {
  return async (req, { doc, params: { filename } }) => {
    try {
      let videoId = getVideoId(doc, filename)

      if (!videoId) {
        const doc = (await req.payload.find({
          collection: collection.slug,
          limit: 1,
          where: {
            bunnyVideoId: {
              exists: true,
            },
            filename: {
              equals: filename,
            },
          },
        })) as unknown as { docs: { bunnyVideoId: string }[] }

        if (doc.docs.length === 0) {
          return new Response('Not Found', { status: 404 })
        }

        videoId = doc.docs[0].bunnyVideoId
      }

      if (stream && videoId) {
        if (!stream.mp4FallbackQuality) {
          return new Response('MP4 fallback quality not configured', { status: 400 })
        }

        const mp4Url = `https://${stream.hostname}/${videoId}/play_${stream.mp4FallbackQuality}.mp4`
        req.payload.logger.info(mp4Url)
        const response = await ky.get(mp4Url)

        if (!response.ok) {
          return new Response(null, { status: 404, statusText: 'Not Found' })
        }

        return new Response(response.body, {
          headers: new Headers({
            'content-length': response.headers.get('Content-Length') || '',
            'content-type': 'video/mp4',
          }),
          status: 200,
        })
      }

      const response = await ky.get(
        `https://${getStorageUrl(storage.region)}/${storage.zoneName}/${posix.join(prefix, filename)}`,
        {
          headers: {
            AccessKey: storage.apiKey,
          },
        },
      )

      if (!response.ok) {
        return new Response(null, { status: 404, statusText: 'Not Found' })
      }

      const etagFromHeaders = req.headers.get('etag') || req.headers.get('if-none-match')
      const objectEtag = response.headers.get('etag') as string

      if (etagFromHeaders && etagFromHeaders === objectEtag) {
        return new Response(null, {
          headers: new Headers({
            'content-length': response.headers.get('Content-Length') || '',
            'content-type': response.headers.get('Content-Type') || '',
            ETag: objectEtag,
          }),
          status: 304,
        })
      }

      return new Response(response.body, {
        headers: new Headers({
          'content-length': response.headers.get('Content-Length') || '',
          'content-type': response.headers.get('Content-Type') || '',
          ETag: objectEtag,
        }),
        status: 200,
      })
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

        return new Response(null, {
          status: err.response.status === 404 ? 404 : 500,
          statusText: err.response.status === 404 ? 'Not Found' : 'Internal Server Error',
        })
      }

      req.payload.logger.error({
        error: err,
        file: { name: filename },
        storage: storage.zoneName,
      })

      return new Response('Internal Server Error', { status: 500 })
    }
  }
}
