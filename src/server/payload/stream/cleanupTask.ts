import type { Payload, PayloadRequest, TaskConfig } from 'payload'

import { BunnyStreamVideoStatus, deleteStreamVideo, getStreamVideo } from '@/server/bunny/stream.js'
import { OPTIONS_DEFAULTS } from '@/server/payload/options/defaults.js'
import { collectStreamOptions } from '@/server/payload/options/inspect.js'
import { streamUploadSessionsCollectionSlug } from '@/server/payload/stream/sessionsCollection.js'
import type { NormalizedBunnyStorageOptions, NormalizedStreamOptions } from '@/shared/types/index.js'

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
  req,
  streamOptions,
}: {
  collectionSlugs: string[]
  req: PayloadRequest
  streamOptions: NormalizedStreamOptions
}): Promise<{ deletedCount: number; errorCount: number }> => {
  const maxAge = streamOptions.cleanup!.maxAge
  const libraryId = streamOptions.libraryId
  const cutoffDate = new Date(Date.now() - maxAge * 1000)

  const incompleteSessions = await req.payload.find({
    collection: streamUploadSessionsCollectionSlug,
    limit: 100,
    overrideAccess: true,
    req,
    where: {
      createdAt: {
        less_than: cutoffDate.toISOString(),
      },
      libraryId: {
        equals: libraryId.toString(),
      },
    },
  })

  if (incompleteSessions.totalDocs === 0) {
    return { deletedCount: 0, errorCount: 0 }
  }

  req.payload.logger.debug({
    msg: `[bunny:stream] cleanup: found ${incompleteSessions.totalDocs} stale sessions for library ${libraryId}`,
  })

  let deletedCount = 0
  let errorCount = 0

  for (const session of incompleteSessions.docs) {
    const { videoId } = session

    try {
      const video = await getStreamVideo({
        apiKey: streamOptions.apiKey,
        libraryId: streamOptions.libraryId,
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
    } catch (err) {
      errorCount++

      if (err instanceof Error && err.message.includes('not found')) {
        try {
          await req.payload.delete({
            id: session.id,
            collection: streamUploadSessionsCollectionSlug,
            overrideAccess: true,
            req,
          })
        } catch (deleteErr) {
          req.payload.logger.error({
            err: deleteErr,
            msg: `[bunny:stream] cleanup: failed to delete session for ${videoId}`,
          })
        }
      } else {
        req.payload.logger.error({ err, msg: `[bunny:stream] cleanup: failed to process video ${videoId}` })
      }
    }
  }

  return { deletedCount, errorCount }
}

export const getStreamCleanupTask = (
  options: NormalizedBunnyStorageOptions,
): TaskConfig<'StorageBunnyStreamCleanup'> | undefined => {
  const streamOptionsByLibrary = collectStreamOptions(options)
  const cleanupStreamOptions = [...streamOptionsByLibrary.values()].filter((c) => c.cleanup)

  if (cleanupStreamOptions.length === 0) {
    return undefined
  }

  const schedule = options.stream?.cleanup?.schedule ?? OPTIONS_DEFAULTS.stream.cleanup.schedule

  return {
    slug: 'StorageBunnyStreamCleanup',
    handler: async ({ req }) => {
      let deletedCount = 0
      let errorCount = 0

      for (const streamOptions of cleanupStreamOptions) {
        const collectionSlugs = [...options.collections]
          .filter(([, collection]) => collection.stream?.libraryId === streamOptions.libraryId)
          .map(([slug]) => slug)
        const result = await processLibrarySessions({ collectionSlugs, req, streamOptions })
        deletedCount += result.deletedCount
        errorCount += result.errorCount
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

      if (orphanSessions.totalDocs > 0) {
        req.payload.logger.warn({
          msg: `[bunny:stream] cleanup: removing ${orphanSessions.totalDocs} orphan session(s) for unconfigured libraries`,
        })

        for (const session of orphanSessions.docs) {
          try {
            await req.payload.delete({
              id: session.id,
              collection: streamUploadSessionsCollectionSlug,
              overrideAccess: true,
              req,
            })
            deletedCount++
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
        output: {},
      }
    },
    schedule: [schedule],
  }
}

export const warnIfCleanupQueueNotRun = ({ payload, task }: { payload: Payload; task: TaskConfig }): void => {
  const autoRun = payload.config.jobs?.autoRun

  if (typeof autoRun === 'function') {
    return
  }

  for (const queue of new Set((task.schedule ?? []).map((entry) => entry.queue ?? 'default'))) {
    const covered = autoRun?.some((entry) => entry.allQueues || (entry.queue ?? 'default') === queue)

    if (!covered) {
      payload.logger.warn({
        msg: `[bunny:stream] cleanup: no jobs.autoRun entry runs the "${queue}" queue, so the cleanup task only runs if a worker processes that queue`,
      })
    }
  }
}
