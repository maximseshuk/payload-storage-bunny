import type { Endpoint, PayloadRequest } from 'payload'
import { APIError } from 'payload'

import { isNotFound } from '@/server/bunny/client.js'
import { deleteStreamVideo, getStreamTusUpload, getStreamVideo, isVideoProcessed } from '@/server/bunny/stream.js'
import { tusAuthOperation } from '@/server/payload/openapi.js'
import { createCollectionContext } from '@/server/payload/options/context.js'
import { assertClientUploadFile } from '@/server/payload/storage/clientUploads/uploadInstructions.js'
import { getLibraryCollectionSlugs, isVideoReferenced } from '@/server/payload/stream/references.js'
import { signStreamVideoToken, verifyStreamVideoToken } from '@/server/payload/stream/tusSignature.js'
import {
  checkStreamTusUpload,
  createStreamTusUploadSession,
  getStreamTusClientHeaders,
  hasStreamTusAccess,
} from '@/server/payload/stream/tusUpload.js'
import { jsonResponse } from '@/shared/http.js'
import { matchesMimeTypePattern } from '@/shared/mimeTypes.js'
import type { PluginStorageBunnyTFunction } from '@/shared/translations/index.js'
import type { StreamTusAuthRequest, StreamTusAuthResponse } from '@/shared/types/index.js'
import type { NormalizedBunnyStorageOptions, NormalizedStreamOptions } from '@/shared/types/optionsNormalized.js'

const deleteReplacedStreamVideo = async ({
  collectionSlug,
  options,
  req,
  streamOptions: { apiKey, libraryId },
  videoId,
}: {
  collectionSlug: string
  options: NormalizedBunnyStorageOptions
  req: PayloadRequest
  streamOptions: NormalizedStreamOptions
  videoId: string
}): Promise<void> => {
  try {
    const collectionSlugs = getLibraryCollectionSlugs(options, collectionSlug, libraryId)
    if (!(await isVideoReferenced({ collectionSlugs, req, videoId }))) {
      await deleteStreamVideo({ apiKey, libraryId, videoId })
    }
  } catch (err) {
    req.payload.logger.warn({ err, msg: '[bunny:stream] tus-auth: failed to delete the replaced video', videoId })
  }
}

export const getStreamTusAuthEndpoint = (options: NormalizedBunnyStorageOptions): Endpoint => ({
  handler: async (req): Promise<Response> => {
    const reqT = req.t as unknown as PluginStorageBunnyTFunction

    try {
      const body: StreamTusAuthRequest = req.json ? await req.json() : req.body

      if (!body.collection || !body.filename || !body.filetype || !body.filesize) {
        throw new APIError(reqT('@seshuk/payload-storage-bunny:errorMissingRequiredFields'), 400, undefined, true)
      }

      const collection = options.collections.has(body.collection)
        ? req.payload.collections[body.collection]?.config
        : undefined
      if (!collection) {
        throw new APIError(reqT('@seshuk/payload-storage-bunny:errorAccessDenied'), 404, undefined, true)
      }

      const collectionContext = createCollectionContext(options, collection)
      const collectionStreamOptions = collectionContext.streamOptions

      if (!collectionStreamOptions || !collectionStreamOptions.tus) {
        throw new APIError(reqT('@seshuk/payload-storage-bunny:errorStreamOptionsMissing'), 400, undefined, true)
      }

      if (!(await hasStreamTusAccess({ data: body, req, streamOptions: collectionStreamOptions }))) {
        throw new APIError(reqT('@seshuk/payload-storage-bunny:errorAccessDenied'), 403, undefined, true)
      }

      assertClientUploadFile({
        collection,
        filename: body.filename,
        filesize: body.filesize,
        mimeType: body.filetype,
        req,
      })
      if (!collectionStreamOptions.mimeTypes.some((pattern) => matchesMimeTypePattern(body.filetype, pattern))) {
        throw new APIError(`File type "${body.filetype}" is not allowed`, 415)
      }

      const tokenInput = {
        collection: body.collection,
        libraryId: collectionStreamOptions.libraryId,
        secret: req.payload.secret,
        user: req.user,
      }
      const withVideoToken = (videoId: string) => ({
        videoId,
        videoToken: signStreamVideoToken({ ...tokenInput, videoId }),
      })

      const { libraryId } = collectionStreamOptions
      const videoId =
        body.videoId && verifyStreamVideoToken({ ...tokenInput, token: body.videoToken, videoId: body.videoId })
          ? body.videoId
          : undefined

      if (videoId) {
        const video = await getStreamVideo({ apiKey: collectionStreamOptions.apiKey, libraryId, videoId }).catch(
          (err) => {
            if (isNotFound(err)) {
              return undefined
            }
            throw err
          },
        )
        const upload =
          video && !isVideoProcessed(video.status)
            ? await checkStreamTusUpload({ streamOptions: collectionStreamOptions, video })
            : undefined
        if (video && (isVideoProcessed(video.status) || upload?.state === 'complete')) {
          return jsonResponse({
            type: 'uploaded',
            libraryId,
            title: video.title || body.filename,
            ...withVideoToken(videoId),
          } satisfies StreamTusAuthResponse)
        }
        const serverUpload = video && getStreamTusUpload(video)
        if (upload?.state === 'incomplete' && serverUpload?.length === body.filesize) {
          return jsonResponse({
            type: 'upload',
            ...getStreamTusClientHeaders(collectionStreamOptions, videoId),
            libraryId,
            uploadUrl: serverUpload.url,
            ...withVideoToken(videoId),
          } satisfies StreamTusAuthResponse)
        }
        if (serverUpload && !body.renew) {
          await deleteReplacedStreamVideo({
            collectionSlug: body.collection,
            options,
            req,
            streamOptions: collectionStreamOptions,
            videoId,
          })
        }
      }

      if (body.renew) {
        throw new APIError('This upload cannot be renewed. Start a new upload.', 409, undefined, true)
      }

      const title = (body.title || body.filename).trim()
      if (!title) {
        throw new APIError(reqT('@seshuk/payload-storage-bunny:errorTitleRequired'), 400, undefined, true)
      }

      const session = await createStreamTusUploadSession({
        filesize: body.filesize,
        filetype: body.filetype,
        req,
        streamOptions: collectionStreamOptions,
        title,
      })

      return jsonResponse({
        type: 'upload',
        expiresIn: session.expiresIn,
        headers: session.headers,
        libraryId,
        uploadUrl: session.uploadUrl,
        ...withVideoToken(session.videoId),
      } satisfies StreamTusAuthResponse)
    } catch (err) {
      if (err instanceof APIError) {
        throw err
      }

      req.payload.logger.error({ err, msg: '[bunny:stream] tus-auth: request failed' })
      throw new APIError(reqT('error:unknown'), 500, undefined, true)
    }
  },
  custom: { openapi: tusAuthOperation },
  method: 'post',
  path: '/storage-bunny/stream/tus-auth',
})
