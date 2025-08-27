import type { TaskConfig } from 'payload'

import type { NormalizedStreamConfig } from '../types/index.js'

import { streamUploadSessionsCollectionSlug } from '../collections/StreamUploadSessions.js'
import { BunnyStreamVideoStatus } from '../types/client.js'
import { deleteStreamVideo, getStreamVideo } from '../utils/client/stream.js'

export const getStreamCleanupTask = (streamConfig: NormalizedStreamConfig): TaskConfig<'StorageBunnyStreamCleanup'> | undefined => {
  if (!streamConfig.cleanup) {
    return undefined
  }

  const { maxAge, schedule } = streamConfig.cleanup

  return {
    slug: 'StorageBunnyStreamCleanup',
    handler: async ({ req }) => {
      const libraryId = streamConfig.libraryId
      const cutoffDate = new Date(Date.now() - maxAge * 1000)

      const incompleteSessions = await req.payload.find({
        collection: streamUploadSessionsCollectionSlug,
        limit: 100,
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
        return {
          output: {},
          state: 'succeeded',
        }
      }

      let deletedCount = 0
      let errorCount = 0

      for (const session of incompleteSessions.docs) {
        const { videoId } = session

        try {
          const video = await getStreamVideo({
            streamConfig,
            videoId,
          })

          if (
            video.status === BunnyStreamVideoStatus.Created ||
            video.status === BunnyStreamVideoStatus.Uploaded ||
            video.status === BunnyStreamVideoStatus.UploadFailed ||
            video.status === BunnyStreamVideoStatus.Error
          ) {
            await deleteStreamVideo({
              streamConfig,
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
            } catch (err) {
              req.payload.logger.error({ err, msg: `Bunny Cleanup: failed to delete session for ${videoId}` })
            }
          } else {
            req.payload.logger.error({ err, msg: `Bunny Cleanup: failed to process video ${videoId}` })
          }
        }
      }

      if (errorCount > 0) {
        req.payload.logger.error(`Bunny Cleanup: completed with errors: ${deletedCount} videos deleted, ${errorCount} errors`)
      }

      return {
        output: {},
        state: 'succeeded',
      }
    },
    schedule: [
      schedule,
    ],
  }
}
