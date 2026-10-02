import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createStreamVideo, deleteStreamVideo, getStreamVideo } from '@/server/bunny/stream.js'
import { HTTPError } from '@/server/http/index.js'
import { streamUploadSessionsCollectionSlug } from '@/server/payload/stream/sessionsCollection.js'

import { getPayload } from '../helpers/int/getPayload.js'
import { hasBunnyCredentials } from '../helpers/shared/credentials.js'

describe.skipIf(!hasBunnyCredentials())('Stream cleanup task', () => {
  let payload: Payload
  let libraryId: number
  let apiKey: string

  beforeAll(async () => {
    payload = await getPayload('cleanup')
    libraryId = parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0')
    apiKey = process.env.BUNNY_STREAM_API_KEY || ''
  })

  afterAll(async () => {
    await payload.destroy()
  })

  const createOrphanedSession = async (videoId: string) => {
    await payload.create({
      collection: streamUploadSessionsCollectionSlug,
      data: {
        createdAt: new Date(Date.now() - 10000).toISOString(),
        libraryId: libraryId.toString(),
        videoId,
      },
      overrideAccess: true,
    })
  }

  const sessionCount = async (videoId: string) =>
    (
      await payload.find({
        collection: streamUploadSessionsCollectionSlug,
        overrideAccess: true,
        where: { videoId: { equals: videoId } },
      })
    ).totalDocs

  it('removes stale sessions and deletes their videos, including already deleted ones', async () => {
    const orphan = await createStreamVideo({ apiKey, libraryId, title: 'cleanup-test-orphan' })
    const gone = await createStreamVideo({ apiKey, libraryId, title: 'cleanup-test-deleted' })
    await createOrphanedSession(orphan.guid)
    await createOrphanedSession(gone.guid)
    await deleteStreamVideo({ apiKey, libraryId, videoId: gone.guid })
    expect(await sessionCount(orphan.guid)).toBe(1)

    await payload.jobs.queue({
      input: {},
      overrideAccess: true,
      queue: 'bunny-cleanup-test-queue',
      task: 'StorageBunnyStreamCleanup',
    })
    await payload.jobs.run({ overrideAccess: true, queue: 'bunny-cleanup-test-queue' })

    expect(await sessionCount(orphan.guid)).toBe(0)
    expect(await sessionCount(gone.guid)).toBe(0)

    let deleted = false
    for (let i = 0; i < 10 && !deleted; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      try {
        await getStreamVideo({ apiKey, libraryId, videoId: orphan.guid })
      } catch (err) {
        if (!(err instanceof Error && err.cause instanceof HTTPError && err.cause.response.status === 404)) {
          throw err
        }
        deleted = true
      }
    }
    expect(deleted).toBe(true)
  }, 60000)
})
