import type { StaticHandler } from '@payloadcms/plugin-cloud-storage/types'
import { getFilePrefix } from '@payloadcms/plugin-cloud-storage/utilities'
import { APIError } from 'payload'

import { HTTPError } from '@/server/http/index.js'
import { getBunnyData } from '@/server/payload/fields/bunnyGroupField.js'
import { storageStaticHandler } from '@/server/payload/storage/serveFile.js'
import { streamStaticHandler } from '@/server/payload/stream/serveStream.js'
import { getStreamUploadResponse, hasStreamClientUploads } from '@/server/payload/stream/tusUpload.js'
import type { CollectionContext } from '@/shared/types/index.js'

export const getStaticHandler = (context: CollectionContext): StaticHandler => {
  const { collection, prefix, signedUrls, storageOptions, streamOptions, usePayloadAccessControl } = context

  return async (req, data) => {
    try {
      const {
        doc,
        params: { filename, operation, prefix: prefixQueryParam, uploadReference },
      } = data
      const videoId = (uploadReference as undefined | { _objectKey?: unknown })?._objectKey
      if (
        streamOptions &&
        typeof videoId === 'string' &&
        hasStreamClientUploads(context, req.payload.config.upload.transformers)
      ) {
        try {
          const response = await getStreamUploadResponse({ req, streamOptions, videoId })
          if (response) {
            return response
          }
        } catch (err) {
          if (!storageOptions?.clientUploads) {
            throw err
          }
          req.payload.logger.warn({
            err,
            msg: '[bunny:stream] upload: Bunny Stream check failed, reading the file from Bunny Storage',
            videoId,
          })
        }
      }
      if (streamOptions) {
        let docId = doc?.id
        let bunnyData = getBunnyData(doc, filename, streamOptions.mimeTypes)

        if (!doc) {
          const result = await req.payload.find({
            collection: collection.slug,
            depth: 0,
            limit: 1,
            overrideAccess: true,
            req,
            where: {
              and: [
                { 'bunnyData.stream.videoId': { exists: true } },
                { or: [{ filename: { equals: filename } }, { 'original.filename': { equals: filename } }] },
              ],
            },
          })

          if (result.docs.length > 0) {
            const foundDoc = result.docs[0]
            docId = foundDoc.id
            bunnyData = getBunnyData(foundDoc, filename, streamOptions.mimeTypes)
          }
        }

        if (bunnyData?.stream) {
          return await streamStaticHandler({
            bunnyData,
            collection,
            docId: docId!,
            req,
            signedUrls: signedUrls || false,
            streamOptions,
            usePayloadAccessControl,
          })
        }
      }

      if (!storageOptions) {
        return new Response('Storage not configured', { status: 404 })
      }

      const resolvedPrefix = await getFilePrefix({
        collection,
        collectionPrefix: prefix,
        doc,
        filename,
        prefixQueryParam,
        req,
        uploadReference,
      })

      return await storageStaticHandler({
        collection,
        collectionPrefix: prefix,
        filename,
        operation,
        prefix: resolvedPrefix,
        req,
        signedUrls: signedUrls || false,
        storageOptions,
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
          ...(storageOptions && { storage: storageOptions.zoneName }),
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
        ...(storageOptions && { storage: storageOptions.zoneName }),
      })

      return new Response('Internal Server Error', { status: 500 })
    }
  }
}
