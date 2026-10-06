import type { Payload, PayloadRequest } from 'payload'
import { createLocalReq } from 'payload'

import { BunnyStreamVideoStatus, deleteStreamVideo, getStreamVideo } from '@/server/bunny/stream.js'
import { getBunnyOptions } from '@/server/payload/options/access.js'
import { collectStreamOptions } from '@/server/payload/options/inspect.js'
import { streamUploadSessionsCollectionSlug } from '@/server/payload/stream/sessionsCollection.js'
import { TIMEOUTS } from '@/shared/constants.js'
import type { NormalizedStreamOptions } from '@/shared/types/index.js'

export type StreamCleanupResult = {
  deletedCount: number
  errorCount: number
  hasMore: boolean
}

const DEFAULT_MAX_DURATION_MS = 25_000
const MIN_TIME_LEFT_MS = 2_000

type Deadline = {
  near: () => boolean
  timeLeft: () => number
}

const isVideoSaved = async ({
  collectionSlugs,
  req,
  videoId,
}: {
  collectionSlugs: string[]
  req: PayloadRequest
  videoId: string
}): Promise<boolean> => {
  for (const collection of collectionSlugs) {
    const { totalDocs } = await req.payload.count({
      collection,
      overrideAccess: true,
      req,
      where: {
        'bunnyData.stream.videoId': {
          equals: videoId,
        },
      },
    })

    if (totalDocs > 0) {
      return true
    }
  }

  return false
}

const processLibrarySessions = async ({
  collectionSlugs,
  deadline,
  req,
  streamOptions,
}: {
  collectionSlugs: string[]
  deadline: Deadline
  req: PayloadRequest
  streamOptions: NormalizedStreamOptions
}): Promise<{ removed: number } & StreamCleanupResult> => {
  const maxAge = streamOptions.cleanup!.maxAge
  const libraryId = streamOptions.libraryId
  const cutoffDate = new Date(Date.now() - maxAge * 1000)

  let deletedCount = 0
  let errorCount = 0
  let removed = 0
  const failedIds: Array<number | string> = []

  for (;;) {
    const incompleteSessions = await req.payload.find({
      collection: streamUploadSessionsCollectionSlug,
      limit: 100,
      overrideAccess: true,
      req,
      where: {
        createdAt: {
          less_than: cutoffDate.toISOString(),
        },
        ...(failedIds.length > 0 && { id: { not_in: failedIds } }),
        libraryId: {
          equals: libraryId.toString(),
        },
      },
    })

    if (incompleteSessions.totalDocs === 0) {
      return { deletedCount, errorCount, hasMore: false, removed }
    }

    req.payload.logger.debug({
      msg: `[bunny:stream] cleanup: found ${incompleteSessions.totalDocs} stale sessions for library ${libraryId}`,
    })

    const failedBefore = failedIds.length

    for (const session of incompleteSessions.docs) {
      if (deadline.near()) {
        return { deletedCount, errorCount, hasMore: true, removed }
      }
      const { videoId } = session

      try {
        const video = await getStreamVideo({
          apiKey: streamOptions.apiKey,
          libraryId: streamOptions.libraryId,
          timeout: deadline.timeLeft(),
          videoId,
        })

        if (
          video.status === BunnyStreamVideoStatus.Created ||
          video.status === BunnyStreamVideoStatus.Uploaded ||
          video.status === BunnyStreamVideoStatus.UploadFailed ||
          video.status === BunnyStreamVideoStatus.Error ||
          !(await isVideoSaved({ collectionSlugs, req, videoId }))
        ) {
          req.payload.logger.debug({ msg: `[bunny:stream] cleanup: deleting orphan video ${videoId}` })
          await deleteStreamVideo({
            apiKey: streamOptions.apiKey,
            libraryId: streamOptions.libraryId,
            timeout: deadline.timeLeft(),
            videoId,
          })

          await req.payload.delete({
            id: session.id,
            collection: streamUploadSessionsCollectionSlug,
            overrideAccess: true,
            req,
          })

          deletedCount++
        } else {
          await req.payload.delete({
            id: session.id,
            collection: streamUploadSessionsCollectionSlug,
            overrideAccess: true,
            req,
          })
        }
        removed++
      } catch (err) {
        if (deadline.near()) {
          return { deletedCount, errorCount, hasMore: true, removed }
        }
        if (err instanceof Error && err.message.includes('not found')) {
          try {
            await req.payload.delete({
              id: session.id,
              collection: streamUploadSessionsCollectionSlug,
              overrideAccess: true,
              req,
            })
            removed++
          } catch (deleteErr) {
            errorCount++
            failedIds.push(session.id)
            req.payload.logger.error({
              err: deleteErr,
              msg: `[bunny:stream] cleanup: failed to delete session for ${videoId}`,
            })
          }
        } else {
          errorCount++
          failedIds.push(session.id)
          req.payload.logger.error({ err, msg: `[bunny:stream] cleanup: failed to process video ${videoId}` })
        }
      }
    }

    const hasMore = incompleteSessions.totalDocs > incompleteSessions.docs.length
    if (!hasMore || failedIds.length === failedBefore) {
      return { deletedCount, errorCount, hasMore, removed }
    }
  }
}

export const runStreamCleanup = async ({
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
  payload,
  req: incomingReq,
}: {
  maxDurationMs?: number
  payload: Payload
  req?: PayloadRequest
}): Promise<StreamCleanupResult> => {
  const options = getBunnyOptions(payload)
  if (!options) {
    throw new Error('[bunny:tasks] cleanup: the storage-bunny plugin is not configured')
  }

  const streamOptionsByLibrary = collectStreamOptions(options)
  const cleanupStreamOptions = [...streamOptionsByLibrary.values()].filter((c) => c.cleanup)
  if (cleanupStreamOptions.length === 0) {
    throw new Error('[bunny:tasks] cleanup: no stream library turns on `stream.cleanup`')
  }

  const req = incomingReq ?? (await createLocalReq({}, payload))
  let deletedCount = 0
  let errorCount = 0
  let removed = 0
  const end = Date.now() + maxDurationMs
  const deadline: Deadline = {
    near: () => end - Date.now() < MIN_TIME_LEFT_MS,
    timeLeft: () => Math.max(1, Math.min(TIMEOUTS.DEFAULT, end - Date.now())),
  }

  for (const streamOptions of cleanupStreamOptions) {
    if (deadline.near()) {
      return { deletedCount, errorCount, hasMore: removed > 0 }
    }
    const collectionSlugs = [...options.collections]
      .filter(([, collection]) => collection.stream?.libraryId === streamOptions.libraryId)
      .map(([slug]) => slug)
    const result = await processLibrarySessions({ collectionSlugs, deadline, req, streamOptions })
    deletedCount += result.deletedCount
    errorCount += result.errorCount
    removed += result.removed
    if (result.hasMore) {
      return { deletedCount, errorCount, hasMore: removed > 0 }
    }
  }

  const maxAge = Math.max(...cleanupStreamOptions.map((c) => c.cleanup!.maxAge))
  const orphanCutoff = new Date(Date.now() - maxAge * 1000)
  const configuredLibraryIds = [...streamOptionsByLibrary.keys()].map((id) => id.toString())

  const orphanSessions = await req.payload.find({
    collection: streamUploadSessionsCollectionSlug,
    limit: 100,
    overrideAccess: true,
    req,
    where: {
      createdAt: {
        less_than: orphanCutoff.toISOString(),
      },
      libraryId: {
        not_in: configuredLibraryIds,
      },
    },
  })

  const removedBeforeOrphans = removed
  if (orphanSessions.totalDocs > 0) {
    req.payload.logger.warn({
      msg: `[bunny:stream] cleanup: removing ${orphanSessions.totalDocs} orphan session(s) for unconfigured libraries`,
    })

    for (const session of orphanSessions.docs) {
      if (deadline.near()) {
        return { deletedCount, errorCount, hasMore: removed > 0 }
      }
      try {
        await req.payload.delete({
          id: session.id,
          collection: streamUploadSessionsCollectionSlug,
          overrideAccess: true,
          req,
        })
        deletedCount++
        removed++
      } catch (err) {
        errorCount++
        req.payload.logger.error({
          err,
          msg: `[bunny:stream] cleanup: failed to delete orphan session ${session.id}`,
        })
      }
    }
  }

  if (errorCount > 0) {
    req.payload.logger.error({
      msg: `[bunny:stream] cleanup: completed with errors: ${deletedCount} videos deleted, ${errorCount} errors`,
    })
  }

  return {
    deletedCount,
    errorCount,
    hasMore: orphanSessions.totalDocs > orphanSessions.docs.length && removed > removedBeforeOrphans,
  }
}
