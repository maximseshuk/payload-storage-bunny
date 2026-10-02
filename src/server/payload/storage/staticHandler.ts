import type { StaticHandler } from '@payloadcms/plugin-cloud-storage/types'
import { APIError } from 'payload'

import { HTTPError } from '@/server/http/index.js'
import { getBunnyData } from '@/server/payload/fields/bunnyGroupField.js'
import { readClientUpload } from '@/server/payload/storage/clientUploads/receipt.js'
import { resolveStoragePrefix } from '@/server/payload/storage/resolvePrefix.js'
import { storageStaticHandler } from '@/server/payload/storage/serveFile.js'
import { trimToCompleteIsoBoxes } from '@/server/payload/stream/clientUploads.js'
import { streamStaticHandler } from '@/server/payload/stream/serveStream.js'
import { streamThumbnailStaticHandler } from '@/server/payload/stream/serveThumbnail.js'
import type { CollectionContext } from '@/shared/types/index.js'

export const getStaticHandler = (context: CollectionContext): StaticHandler => {
  const { collection, prefix, signedUrls, storageConfig, streamConfig, usePayloadAccessControl } = context

  return async (req, data) => {
    try {
      const {
        doc,
        params: { filename, prefix: prefixQueryParam, uploadReference },
      } = data
      const clientUpload = readClientUpload({ collectionSlug: collection.slug, filename, req, uploadReference })
      if (streamConfig) {
        if (clientUpload?.videoId) {
          return new Response(trimToCompleteIsoBoxes(Buffer.from(clientUpload.head ?? '', 'base64')))
        }

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
            overrideAccess: true,
            req,
            where: {
              'bunnyData.stream.videoId': { exists: true },
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

      const resolvedPrefix = await resolveStoragePrefix({
        collection,
        doc,
        fallbackPrefix: prefix,
        filename,
        prefixQueryParam,
        req,
        uploadPrefix: clientUpload?.prefix,
      })

      return await storageStaticHandler({
        collection,
        collectionPrefix: prefix,
        filename,
        prefix: resolvedPrefix,
        req,
        signedUrls: signedUrls || false,
        storageConfig,
        usePayloadAccessControl,
      })
    } catch (err) {
      if (err instanceof APIError && err.status < 500) {
        return new Response(null, { status: err.status })
      }

      if (err instanceof HTTPError) {
        req.payload.logger.error({
          err,
          file: { name: data.params.filename },
          msg: '[bunny:storage] serve: upstream request failed',
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
        msg: '[bunny:storage] serve: static handler failed',
        ...(storageConfig && { storage: storageConfig.zoneName }),
      })

      return new Response('Internal Server Error', { status: 500 })
    }
  }
}
