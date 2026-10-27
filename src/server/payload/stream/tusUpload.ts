import type { PayloadRequest, UploadTransformer } from 'payload'
import { getAccessResults } from 'payload'
import { getUploadTransformerInternal } from 'payload/internal'

import { isClientError, isNotFound } from '@/server/bunny/client.js'
import type { BunnyStreamVideo } from '@/server/bunny/stream.js'
import {
  createStreamTusUpload,
  createStreamVideo,
  getStreamTusUpload,
  getStreamTusUploadOffset,
  getStreamVideo,
  getStreamVideoOriginalSize,
  isVideoInErrorState,
  isVideoProcessed,
} from '@/server/bunny/stream.js'
import { createStreamVideoSession } from '@/server/payload/stream/sessionsCollection.js'
import { getStreamTusHeaders } from '@/server/payload/stream/tusSignature.js'
import { intersectMimeTypes } from '@/shared/mimeTypes.js'
import type { CollectionContext, StreamTusAuthRequest } from '@/shared/types/index.js'
import type { NormalizedStreamOptions } from '@/shared/types/optionsNormalized.js'

const VERIFIED_STREAM_UPLOAD_CONTEXT_KEY = 'bunnyVerifiedStreamUpload'
const PROBE_SIGNATURE_TTL_SECONDS = 60
const CLIENT_SIGNATURE_TTL_SECONDS = 300

type StreamTusUploadCheck =
  | { details?: object; reason: string; state: 'incomplete' | 'invalid' }
  | { length: number; state: 'complete' }

const readsWholeStreamFile = (transformer: UploadTransformer, mimeTypes: string[] | undefined) =>
  typeof transformer.transformFile === 'function' &&
  !getUploadTransformerInternal(transformer)?.prepareUpload &&
  (transformer.mimeTypes.includes('*/*') || !!intersectMimeTypes(transformer.mimeTypes, mimeTypes)?.length)

export const hasStreamClientUploads = (
  { collection, isTusUploadSupported, storageOptions, streamOptions }: CollectionContext,
  transformers: undefined | UploadTransformer[],
): boolean =>
  isTusUploadSupported &&
  (!storageOptions || !!storageOptions.clientUploads) &&
  !(typeof collection.upload === 'object' && collection.upload.mimeTypes?.length) &&
  !transformers?.some((transformer) => readsWholeStreamFile(transformer, streamOptions?.mimeTypes))

export const isStreamUploadVerified = (req: PayloadRequest, videoId: string): boolean =>
  req.context?.[VERIFIED_STREAM_UPLOAD_CONTEXT_KEY] === videoId

export const hasStreamTusAccess = async ({
  data,
  req,
  streamOptions,
}: {
  data: StreamTusAuthRequest
  req: PayloadRequest
  streamOptions: NormalizedStreamOptions
}): Promise<boolean> => {
  const defaultAccess = async (): Promise<boolean> => {
    const accessResults = await getAccessResults({ req })
    return accessResults.canAccessAdmin === true && accessResults.collections?.[data.collection]?.create === true
  }

  return streamOptions.tus?.access
    ? await streamOptions.tus.access({ data, defaultAccess, req })
    : await defaultAccess()
}

export const createStreamTusVideo = async ({
  req,
  streamOptions,
  title,
}: {
  req: PayloadRequest
  streamOptions: NormalizedStreamOptions
  title: string
}): Promise<string> => {
  const { apiKey, cleanup, libraryId, thumbnailTime } = streamOptions
  const video = await createStreamVideo({ apiKey, libraryId, thumbnailTime, title })

  if (cleanup) {
    await createStreamVideoSession({ libraryId: video.videoLibraryId, payload: req.payload, videoId: video.guid })
  }

  return video.guid
}

export const getStreamTusClientHeaders = (
  { apiKey, libraryId, tus }: NormalizedStreamOptions,
  videoId: string,
): { expiresIn: number; headers: Record<string, string> } => {
  const expiresIn = Math.min(CLIENT_SIGNATURE_TTL_SECONDS, tus?.expiresIn ?? CLIENT_SIGNATURE_TTL_SECONDS)
  return { expiresIn, headers: getStreamTusHeaders({ apiKey, expiresIn, libraryId, videoId }) }
}

export const createStreamTusUploadSession = async ({
  filesize,
  filetype,
  req,
  streamOptions,
  title,
}: {
  filesize: number
  filetype: string
  req: PayloadRequest
  streamOptions: NormalizedStreamOptions
  title: string
}): Promise<{ expiresIn: number; headers: Record<string, string>; uploadUrl: string; videoId: string }> => {
  const { apiKey, libraryId, thumbnailTime, tus } = streamOptions
  const videoId = await createStreamTusVideo({ req, streamOptions, title })
  const uploadUrl = await createStreamTusUpload({
    apiKey,
    headers: getStreamTusHeaders({
      apiKey,
      expiresIn: tus?.expiresIn ?? CLIENT_SIGNATURE_TTL_SECONDS,
      libraryId,
      videoId,
    }),
    libraryId,
    metadata: {
      filetype,
      title,
      ...(typeof thumbnailTime === 'number' && { thumbnailTime: thumbnailTime.toString() }),
    },
    size: filesize,
    videoId,
  })
  return { ...getStreamTusClientHeaders(streamOptions, videoId), uploadUrl, videoId }
}

export const checkStreamTusUpload = async ({
  streamOptions: { apiKey, libraryId },
  video,
}: {
  streamOptions: NormalizedStreamOptions
  video: BunnyStreamVideo
}): Promise<StreamTusUploadCheck> => {
  if (isVideoInErrorState(video.status)) {
    return { reason: 'Bunny Stream marked the upload as failed', state: 'invalid' }
  }
  const upload = getStreamTusUpload(video)
  if (!upload) {
    return { reason: 'the video has no upload created by the server', state: 'invalid' }
  }

  try {
    const { length, offset } = await getStreamTusUploadOffset({
      headers: getStreamTusHeaders({ apiKey, expiresIn: PROBE_SIGNATURE_TTL_SECONDS, libraryId, videoId: video.guid }),
      uploadUrl: upload.url,
    })
    return length > 0 && offset === length
      ? { length, state: 'complete' }
      : { details: { length, offset }, reason: 'the upload has not finished yet', state: 'incomplete' }
  } catch (err) {
    if (!isClientError(err)) {
      throw err
    }
    if (!isVideoProcessed(video.status)) {
      return { details: { err }, reason: 'Bunny Stream does not know the upload', state: 'invalid' }
    }
  }

  const original = await getStreamVideoOriginalSize({ apiKey, libraryId, videoId: video.guid }).catch(() => 0)
  return original > 0 && original !== upload.length
    ? {
        details: { length: upload.length, original },
        reason: 'the original file in Bunny Stream does not match the upload size',
        state: 'invalid',
      }
    : { length: upload.length, state: 'complete' }
}

export const getStreamUploadResponse = async ({
  req,
  streamOptions,
  videoId,
}: {
  req: PayloadRequest
  streamOptions: NormalizedStreamOptions
  videoId: string
}): Promise<Response | undefined> => {
  let video
  try {
    video = await getStreamVideo({ apiKey: streamOptions.apiKey, libraryId: streamOptions.libraryId, videoId })
  } catch (err) {
    if (isNotFound(err)) {
      return undefined
    }
    throw err
  }

  const upload = await checkStreamTusUpload({ streamOptions, video })
  if (upload.state !== 'complete') {
    req.payload.logger.warn({
      msg: `[bunny:stream] upload: ${upload.reason}`,
      status: video.status,
      videoId,
      ...upload.details,
    })
    return new Response(null, { status: 400 })
  }

  req.context ??= {}
  req.context[VERIFIED_STREAM_UPLOAD_CONTEXT_KEY] = videoId
  return new Response(new Uint8Array(1), {
    headers: { 'Content-Range': `bytes 0-0/${upload.length}` },
    status: 206,
  })
}
