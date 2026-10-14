import type { Endpoint } from 'payload'
import { APIError, NotFound } from 'payload'

import { streamThumbnailOperation } from '@/server/payload/openapi.js'
import { streamThumbnailStaticHandler } from '@/server/payload/stream/serveThumbnail.js'
import type { PluginStorageBunnyTFunction } from '@/shared/translations/index.js'
import type { NormalizedBunnyStorageOptions } from '@/shared/types/optionsNormalized.js'

import { findReadableVideo } from './findReadableVideo.js'

export const getStreamThumbnailEndpoint = (options: NormalizedBunnyStorageOptions): Endpoint => ({
  handler: async (req): Promise<Response> => {
    const reqT = req.t as unknown as PluginStorageBunnyTFunction

    try {
      const { file } = (req.routeParams ?? {}) as { file?: string }
      if (file !== 'thumbnail.jpg' && file !== 'preview.webp') {
        throw new NotFound(req.t)
      }

      const { context, streamOptions, videoId } = await findReadableVideo(
        options,
        req,
        ({ thumbnail, usePayloadAccessControl }) => !!thumbnail && usePayloadAccessControl,
      )

      return await streamThumbnailStaticHandler({
        collection: context.collection,
        req,
        signedUrls: context.signedUrls || false,
        streamOptions,
        thumbnailType: file,
        usePayloadAccessControl: true,
        videoId,
      })
    } catch (err) {
      if (err instanceof APIError) {
        throw err
      }

      req.payload.logger.error({ err, msg: '[bunny:stream] thumbnail: request failed' })
      throw new APIError(reqT('error:unknown'), 500, undefined, true)
    }
  },
  custom: { openapi: streamThumbnailOperation },
  method: 'get',
  path: '/storage-bunny/stream/thumbnail/:collection/:id/:videoId/:file',
})
