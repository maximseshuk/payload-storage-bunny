import type { PayloadRequest, TaskConfig } from 'payload'

import { CONFIG_DEFAULTS } from '@/config/defaults.js'
import { collectStreamConfigs } from '@/config/inspect.js'
import { BunnyStreamVideoStatus, deleteStreamVideo, getStreamVideo } from '@/stream/api.js'
import { streamUploadSessionsCollectionSlug } from '@/stream/sessionsCollection.js'
import type { NormalizedBunnyStorageConfig, NormalizedStreamConfig } from '@/types/index.js'

const processLibrarySessions = async ({
  req,
  streamConfig,
}: {
  req: PayloadRequest
  streamConfig: NormalizedStreamConfig
}): Promise<{ deletedCount: number; errorCount: number }> => {
  const maxAge = streamConfig.cleanup!.maxAge
  const libraryId = streamConfig.libraryId
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
        apiKey: streamConfig.apiKey,
        libraryId: streamConfig.libraryId,
        videoId,
      })

      if (
        video.status === BunnyStreamVideoStatus.Created ||
        video.status === BunnyStreamVideoStatus.Uploaded ||
        video.status === BunnyStreamVideoStatus.UploadFailed ||
        video.status === BunnyStreamVideoStatus.Error
      ) {
        req.payload.logger.debug({ msg: `[bunny:stream] cleanup: deleting orphan video ${videoId}` })
        await deleteStreamVideo({
          apiKey: streamConfig.apiKey,
          libraryId: streamConfig.libraryId,
          videoId,
        })

        await req.payload.delete({
          id: session.id,
          collection: streamUploadSessionsCollectionSlug,
          req,
        })

        deletedCount++
      } else {
        await req.payload.delete({
          id: session.id,
          collection: streamUploadSessionsCollectionSlug,
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
  config: NormalizedBunnyStorageConfig,
): TaskConfig<'StorageBunnyStreamCleanup'> | undefined => {
  const streamConfigs = collectStreamConfigs(config)
  const cleanupConfigs = [...streamConfigs.values()].filter((c) => c.cleanup)

  if (cleanupConfigs.length === 0) {
    return undefined
  }

  const schedule = config.stream?.cleanup?.schedule ?? CONFIG_DEFAULTS.stream.cleanup.schedule

  return {
    slug: 'StorageBunnyStreamCleanup',
    handler: async ({ req }) => {
      let deletedCount = 0
      let errorCount = 0

      for (const streamConfig of cleanupConfigs) {
        const result = await processLibrarySessions({ req, streamConfig })
        deletedCount += result.deletedCount
        errorCount += result.errorCount
      }

      const maxAge = Math.max(...cleanupConfigs.map((c) => c.cleanup!.maxAge))
      const orphanCutoff = new Date(Date.now() - maxAge * 1000)
      const configuredLibraryIds = [...streamConfigs.keys()].map((id) => id.toString())

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
        state: 'succeeded',
      }
    },
    schedule: [schedule],
  }
}
