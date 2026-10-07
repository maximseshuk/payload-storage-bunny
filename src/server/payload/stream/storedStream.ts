import type { Payload, PayloadRequest, Where } from 'payload'

import type { BunnyStreamCredentials } from '@/server/bunny/stream.js'
import {
  getStreamVideo,
  getStreamVideoOriginalSize,
  getStreamVideoState,
  isVideoEncoded,
  listStreamVideos,
} from '@/server/bunny/stream.js'
import { HTTPError } from '@/server/http/index.js'
import { readStoredVideo } from '@/server/payload/fields/bunnyGroupField.js'
import type { BunnyStreamData, StreamVideoState } from '@/shared/types/index.js'

type WriteStoredStreamArgs = {
  collection: string
  id: number | string
  req: PayloadRequest
  stream: Pick<BunnyStreamData, 'resolutions' | 'status' | 'videoId'>
  whenStatus?: null | StreamVideoState
}

export const writeStoredStream = async ({
  collection,
  id,
  req,
  stream,
  whenStatus,
}: WriteStoredStreamArgs): Promise<boolean> => {
  const where: Where[] = [{ id: { equals: id } }, { 'bunnyData.stream.videoId': { equals: stream.videoId } }]
  if (whenStatus !== undefined) {
    where.push({ 'bunnyData.stream.status': whenStatus ? { equals: whenStatus } : { exists: false } })
  }

  const stored = readStoredVideo(await req.payload.db.findOne({ collection, req, where: { and: where } }))
  if (!stored) {
    return false
  }

  const resolutions = stream.resolutions ?? stored.resolutions
  const status = stream.status !== undefined ? stream.status : stored.status
  const updated = await req.payload.db.updateOne({
    collection,
    data: {
      bunnyData: {
        stream: {
          ...(resolutions && { resolutions }),
          ...(status !== undefined && { status }),
          videoId: stream.videoId,
        },
      },
      updatedAt: null,
    },
    req,
    select: { id: true },
    where: { and: where },
  })
  return Boolean(updated)
}

export const fetchStreamVideoState = async (
  args: Parameters<typeof getStreamVideo>[0],
): Promise<{ encoded: boolean; state: StreamVideoState }> => {
  try {
    const video = await getStreamVideo(args)
    return { encoded: isVideoEncoded(video.status), state: getStreamVideoState(video) }
  } catch (err) {
    if (err instanceof Error && err.cause instanceof HTTPError && err.cause.response.status === 404) {
      await listStreamVideos({ apiKey: args.apiKey, itemsPerPage: 1, libraryId: args.libraryId, timeout: args.timeout })
      return { encoded: false, state: 'failed' }
    }
    throw err
  }
}

export const checkStreamOriginalSize = async ({
  apiKey,
  collection,
  doc,
  libraryId,
  logger,
  videoId,
}: {
  collection: string
  doc: { filesize?: unknown; id: number | string }
  logger: Payload['logger']
  videoId: string
} & BunnyStreamCredentials): Promise<void> => {
  if (typeof doc.filesize !== 'number' || doc.filesize <= 0) {
    return
  }
  let original: number
  try {
    original = await getStreamVideoOriginalSize({ apiKey, libraryId, videoId })
  } catch {
    return
  }
  if (original > 0 && original !== doc.filesize) {
    logger.warn({
      collection,
      docId: doc.id,
      filesize: doc.filesize,
      msg: '[bunny:stream] the original file in Bunny Stream does not match the stored file size',
      original,
      videoId,
    })
  }
}
