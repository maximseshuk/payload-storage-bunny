import type { CollectionContext } from '@/types/index.js'
import type { StaticHandler } from '@payloadcms/plugin-cloud-storage/types'

import { getBunnyData } from '@/utils/index.js'
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
        if (filename?.startsWith('bunny:stream:')) {
          const parts = filename.split(':')
          if (parts.length === 4 && (parts[3] === 'thumbnail.jpg' || parts[3] === 'preview.webp')) {
            const videoId = parts[2]
            const thumbnailType = parts[3]

            return await streamThumbnailStaticHandler({
              collection,
              req,
              signedUrls: signedUrls || false,
              streamConfig,
              thumbnailType,
              usePayloadAccessControl,
              videoId,
            })
          }
        }

        let docId = doc?.id
        let bunnyData = getBunnyData(doc, filename)
        const docFilename = doc && 'filename' in doc ? (doc.filename as string) : undefined

        if (!bunnyData?.stream || docFilename !== filename) {
          const result = await req.payload.find({
            collection: collection.slug,
            limit: 1,
            where: {
              bunnyVideoId: { exists: true },
              filename: { equals: filename },
            },
          })

          if (result.docs.length > 0) {
            const foundDoc = result.docs[0]
            docId = foundDoc.id
            bunnyData = getBunnyData(foundDoc, filename)
          }
        }

        if (bunnyData?.stream) {
          return await streamStaticHandler({
            bunnyData,
            collection,
            docId: docId!,
            req,
            signedUrls: signedUrls || false,
            streamConfig,
            usePayloadAccessControl,
          })
        }
      }

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
