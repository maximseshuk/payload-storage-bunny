import type { StaticHandler } from '@payloadcms/plugin-cloud-storage/types'
import type { CollectionConfig } from 'payload'

import { HTTPError } from 'ky'

import type { BunnyAdapterOptions } from './types.js'

import { storageStaticHandler } from './staticHandlerStorage.js'
import { streamStaticHandler } from './staticHandlerStream.js'
import { getVideoFromDoc } from './utils.js'

type Args = { collection: CollectionConfig; prefix?: string } & BunnyAdapterOptions

export const getStaticHandler = ({
  collection,
  prefix = '',
  storage,
  stream,
}: Args): StaticHandler => {
  return async (req, data) => {
    try {
      const { doc, params: { filename } } = data

      if (stream) {
        if (filename && filename.startsWith('bunny:stream:')) {
          const parts = filename.split(':')
          if (parts.length === 4 && parts[3] === 'thumbnail.jpg') {
            const videoId = parts[2]

            const thumbnailUrl = `https://${stream.hostname}/${videoId}/thumbnail.jpg`

            try {
              const response = await fetch(thumbnailUrl)
              if (!response.ok) {
                return new Response(`Thumbnail not found: ${response.status}`, { status: response.status })
              }

              const headers = new Headers()
              response.headers.forEach((value, key) => {
                headers.set(key, value)
              })

              return new Response(response.body, {
                headers,
                status: response.status,
              })
            } catch (error) {
              req.payload.logger.error({
                error,
                thumbnailUrl,
              })
              return new Response('Error fetching thumbnail', { status: 500 })
            }
          }
        }

        let video = getVideoFromDoc(doc, filename)

        if (!video) {
          const result = await req.payload.find({
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
          })

          if (result.docs.length > 0) {
            video = getVideoFromDoc(result.docs[0], filename)
          }
        }

        if (video && video.videoId) {
          return await streamStaticHandler(req, stream, {
            collection: collection.slug,
            docId: video.docId,
            videoId: video.videoId,
            videoMeta: video.videoMeta,
          })
        }
      }

      return await storageStaticHandler(req, data, filename, storage, prefix)
    } catch (err) {
      if (err instanceof HTTPError) {
        const errorResponse = await err.response.text()

        req.payload.logger.error({
          error: {
            response: errorResponse,
            status: err.response.status,
            statusText: err.response.statusText,
          },
          file: { name: data.params.filename },
          storage: storage.zoneName,
        })

        return new Response(null, {
          status: err.response.status === 404 ? 404 : 500,
          statusText: err.response.status === 404 ? 'Not Found' : 'Internal Server Error',
        })
      }

      req.payload.logger.error({
        error: err,
        file: { name: data.params.filename },
        storage: storage.zoneName,
      })

      return new Response('Internal Server Error', { status: 500 })
    }
  }
}