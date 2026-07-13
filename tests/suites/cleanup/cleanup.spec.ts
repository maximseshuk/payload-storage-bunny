import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { streamUploadSessionsCollectionSlug } from '@/collections/StreamUploadSessions.js'
import { createStreamVideo, deleteStreamVideo, getStreamVideo } from '@/utils/client/stream.js'

import { hasBunnyCredentials } from '../../helpers/credentials.js'
import { getPayload } from '../../helpers/getPayload.js'

describe.skipIf(!hasBunnyCredentials())('Stream Cleanup Task', () => {
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

  it('should register task with configured schedule', () => {
    const task = payload.config.jobs?.tasks?.find((t) => t.slug === 'StorageBunnyStreamCleanup')

    expect(task).toBeDefined()
    expect(task?.schedule?.[0]?.cron).toBe('13 37 * * *')
    expect(task?.schedule?.[0]?.queue).toBe('bunny-cleanup-test-queue')
  })

  it('should cleanup incomplete upload sessions', async () => {
    const video = await createStreamVideo({ apiKey, libraryId, title: 'cleanup-test-orphan' })
    await createOrphanedSession(video.guid)

    const sessionsBefore = await payload.find({
      collection: streamUploadSessionsCollectionSlug,
      overrideAccess: true,
      where: { videoId: { equals: video.guid } },
    })
    expect(sessionsBefore.totalDocs).toBe(1)

    await payload.jobs.queue({ input: {}, queue: 'bunny-cleanup-test-queue', task: 'StorageBunnyStreamCleanup' })
    await payload.jobs.run({ queue: 'bunny-cleanup-test-queue' })

    const sessionsAfter = await payload.find({
      collection: streamUploadSessionsCollectionSlug,
      overrideAccess: true,
      where: { videoId: { equals: video.guid } },
    })
    expect(sessionsAfter.totalDocs).toBe(0)

    let deleted = false
    for (let i = 0; i < 10 && !deleted; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      try {
        await getStreamVideo({ apiKey, libraryId, videoId: video.guid })
      } catch {
        deleted = true
      }
    }
    expect(deleted).toBe(true)
  }, 60000)

  it('should cleanup session when video already deleted', async () => {
    const video = await createStreamVideo({ apiKey, libraryId, title: 'cleanup-test-deleted' })
    await createOrphanedSession(video.guid)
    await deleteStreamVideo({ apiKey, libraryId, videoId: video.guid })

    await payload.jobs.queue({ input: {}, queue: 'bunny-cleanup-test-queue', task: 'StorageBunnyStreamCleanup' })
    await payload.jobs.run({ queue: 'bunny-cleanup-test-queue' })

    const sessionsAfter = await payload.find({
      collection: streamUploadSessionsCollectionSlug,
      overrideAccess: true,
      where: { videoId: { equals: video.guid } },
    })
    expect(sessionsAfter.totalDocs).toBe(0)
  }, 30000)
})
