import type { CollectionContext } from '@/types/index.js'
import type { StaticHandler } from '@payloadcms/plugin-cloud-storage/types'

import { parseVideoFromDocument } from '@/utils/index.js'
import { HTTPError } from 'ky'

import { storageStaticHandler } from './storage.js'
import { streamStaticHandler } from './stream.js'
import { streamThumbnailStaticHandler } from './streamThumbnail.js'

export const getStaticHandler = (context: CollectionContext): StaticHandler => {
  const { collection, prefix, signedUrls, storageConfig, streamConfig, usePayloadAccessControl } = context

  return async (req, data) => {
    try {
      const { doc, params: { filename } } = data

      if (streamConfig) {
        // Handle stream thumbnail requests
        if (filename?.startsWith('bunny:stream:')) {
          const parts = filename.split(':')
          if (parts.length === 4 && parts[3] === 'thumbnail.jpg') {
            const videoId = parts[2]

            return await streamThumbnailStaticHandler({
              collection,
              req,
              signedUrls: signedUrls || false,
              streamConfig,
              usePayloadAccessControl,
              videoId,
            })
          }
        }

        // Handle video stream requests
        let video = parseVideoFromDocument(doc, filename)

        if (!video) {
          const result = await req.payload.find({
            collection: collection.slug,
            limit: 1,
            where: {
              bunnyVideoId: { exists: true },
              filename: { equals: filename },
            },
          })

          if (result.docs.length > 0) {
            video = parseVideoFromDocument(result.docs[0], filename)
          }
        }

        if (video?.videoId) {
          return await streamStaticHandler({
            collection,
            docId: video.docId,
            req,
            signedUrls: signedUrls || false,
            streamConfig,
            usePayloadAccessControl,
            videoId: video.videoId,
            videoMeta: video.videoMeta,
          })
        }
      }

      // Handle storage requests
      if (!storageConfig) {
        return new Response('Storage not configured', { status: 404 })
      }

      return await storageStaticHandler({
        collection,
        filename,
        prefix,
        req,
        signedUrls: signedUrls || false,
        storageConfig,
        usePayloadAccessControl,
      })
    } catch (err) {
      if (err instanceof HTTPError) {
        req.payload.logger.error({
          err,
          file: { name: data.params.filename },
          ...(storageConfig && { storage: storageConfig.zoneName }),
        })

        return new Response(null, {
          status: err.response.status === 404 ? 404 : 500,
          statusText: err.response.status === 404 ? 'Not Found' : 'Internal Server Error',
        })
      }

      req.payload.logger.error({
        err,
        file: { name: data.params.filename },
        ...(storageConfig && { storage: storageConfig.zoneName }),
      })

      return new Response('Internal Server Error', { status: 500 })
    }
  }
}
