import type { JsonObject, Payload, PayloadRequest, TypeWithVersion, Where } from 'payload'

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

const VERSION_WRITE_ATTEMPTS = 3

const storedStreamWhere = (
  path: string,
  { id, stream, whenStatus }: Pick<WriteStoredStreamArgs, 'id' | 'stream' | 'whenStatus'>,
): Where[] => [
  { id: { equals: id } },
  { [`${path}.videoId`]: { equals: stream.videoId } },
  ...(whenStatus === undefined
    ? []
    : [{ [`${path}.status`]: whenStatus ? { equals: whenStatus } : { exists: false } }]),
]

export const writeStoredStream = async ({
  collection,
  id,
  req,
  stream,
  whenStatus,
}: WriteStoredStreamArgs): Promise<boolean> => {
  const where = storedStreamWhere('bunnyData.stream', { id, stream, whenStatus })

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

export const findStreamVersion = async ({
  collection,
  parent,
  req,
  videoId,
}: {
  collection: string
  parent?: number | string
  req: PayloadRequest
  videoId: string
}): Promise<TypeWithVersion<JsonObject> | undefined> => {
  if (!req.payload.collections[collection]?.config.versions?.drafts) {
    return undefined
  }
  const byVideo: Where = {
    and: [
      { 'version.bunnyData.stream.videoId': { equals: videoId } },
      ...(parent === undefined ? [] : [{ parent: { equals: parent } }]),
    ],
  }
  const findNewest = async (where: Where) =>
    (
      await req.payload.db.findVersions<JsonObject>({
        collection,
        limit: 1,
        pagination: false,
        req,
        sort: '-updatedAt',
        where,
      })
    ).docs[0]
  return (await findNewest({ and: [byVideo, { latest: { equals: true } }] })) ?? (await findNewest(byVideo))
}

export const writeStoredVersionStream = async ({
  collection,
  id,
  req,
  stream,
  whenStatus,
}: WriteStoredStreamArgs): Promise<boolean> => {
  const where = storedStreamWhere('version.bunnyData.stream', { id, stream, whenStatus })

  for (let attempt = 0; attempt < VERSION_WRITE_ATTEMPTS; attempt++) {
    const {
      docs: [row],
    } = await req.payload.db.findVersions<JsonObject>({
      collection,
      limit: 1,
      pagination: false,
      req,
      where: { and: where },
    })
    const stored = readStoredVideo(row?.version)
    if (!row || !stored) {
      return false
    }

    const updated = await req.payload.db.updateVersion({
      id,
      collection,
      req,
      select: { id: true },
      versionData: {
        createdAt: row.createdAt,
        latest: row.latest,
        parent: row.parent,
        publishedLocale: row.publishedLocale,
        updatedAt: row.updatedAt,
        version: {
          ...row.version,
          bunnyData: {
            stream: {
              ...stored,
              ...(stream.resolutions && { resolutions: stream.resolutions }),
              ...(stream.status !== undefined && { status: stream.status }),
              videoId: stream.videoId,
            },
          },
        },
      },
      where: {
        and: [
          ...where,
          { updatedAt: { equals: row.updatedAt } },
          row.latest === true
            ? { latest: { equals: true } }
            : { or: [{ latest: { equals: false } }, { latest: { exists: false } }] },
        ],
      } as never,
    })
    if (updated) {
      return true
    }
  }
  return false
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
