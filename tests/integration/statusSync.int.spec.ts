import type { Payload } from 'payload'
import { createPayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { syncStreamStatus } from '@/index.js'
import { BunnyStreamVideoStatus, getStreamVideo } from '@/server/bunny/stream.js'
import { writeStoredStream } from '@/server/payload/stream/storedStream.js'

import { cleanupStreamVideos, waitForVideoProcessed } from '../helpers/e2e/bunnyStream.js'
import { getPayload } from '../helpers/int/getPayload.js'
import { videoFile } from '../helpers/int/videoFile.js'
import { hasBunnyCredentials } from '../helpers/shared/credentials.js'

vi.mock('@/server/bunny/stream.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/bunny/stream.js')>()
  return { ...actual, getStreamVideo: vi.fn(actual.getStreamVideo) }
})

const COLLECTION = 'status-sync-test'

describe.skipIf(!hasBunnyCredentials())('Stream status sync task', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload('statusSync')
  })

  afterAll(async () => {
    await cleanupStreamVideos([COLLECTION])
    await payload.destroy()
  })

  const storedStream = async (id: number | string) =>
    (
      (await payload.db.findOne({ collection: COLLECTION, where: { id: { equals: id } } })) as {
        bunnyData?: { stream?: { status?: string; videoId?: string } }
      }
    ).bunnyData?.stream

  const setStoredStream = async (id: number | string, stream: Record<string, unknown>) => {
    await payload.db.updateOne({
      collection: COLLECTION,
      data: { bunnyData: { stream } },
      returning: false,
      where: { id: { equals: id } },
    })
  }

  const callEndpoint = async (task: string) => {
    const endpoint = payload.config.endpoints?.find(
      (entry) => entry.path === '/storage-bunny/tasks/:task' && entry.method === 'post',
    )
    if (!endpoint) {
      throw new Error('Tasks endpoint not found')
    }
    const req = await createPayloadRequest({ payload })
    Object.assign(req, {
      headers: new Headers({ authorization: 'Bearer status-sync-test-secret' }),
      routeParams: { task },
      searchParams: new URLSearchParams(),
    })
    return endpoint.handler(req)
  }

  it('stores the state of processing videos from the function, the Payload job and the endpoint', async () => {
    const upload = await payload.create({
      collection: COLLECTION,
      data: { alt: 'Status sync video' },
      file: await videoFile(`${COLLECTION}.mp4`),
      overrideAccess: true,
    })
    const videoId = (upload.bunnyData as { stream: { videoId: string } }).stream.videoId
    expect((await storedStream(upload.id))?.status).toBe('processing')
    expect(await waitForVideoProcessed(videoId)).toBe(true)

    expect(await syncStreamStatus({ payload })).toEqual({ checked: 1, failed: 0, hasMore: false, updated: 1 })
    expect((await storedStream(upload.id))?.status).toBe('ready')

    await setStoredStream(upload.id, { status: 'processing', videoId })
    await payload.jobs.queue({
      input: {},
      overrideAccess: true,
      queue: 'bunny-status-sync-test-queue',
      task: 'StorageBunnyStreamStatusSync' as never,
    })
    await payload.jobs.run({ overrideAccess: true, queue: 'bunny-status-sync-test-queue' })
    expect((await storedStream(upload.id))?.status).toBe('ready')

    await setStoredStream(upload.id, { status: 'processing', videoId })
    const response = await callEndpoint('status-sync')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ checked: 1, failed: 0, hasMore: false, task: 'status-sync', updated: 1 })
    expect((await storedStream(upload.id))?.status).toBe('ready')

    expect((await callEndpoint('cleanup')).status).toBe(404)

    await setStoredStream(upload.id, { status: 'processing', videoId: '00000000-0000-0000-0000-000000000000' })
    expect(await syncStreamStatus({ payload })).toMatchObject({ checked: 1, updated: 1 })
    expect((await storedStream(upload.id))?.status).toBe('failed')

    await setStoredStream(upload.id, { status: 'ready', videoId })
    await payload.delete({ id: upload.id, collection: COLLECTION, overrideAccess: true })
  }, 180000)

  it('writes nothing after the document moved to another video', async () => {
    const doc = await payload.db.create({
      collection: COLLECTION,
      data: { alt: 'Replaced video', bunnyData: { stream: { status: 'processing', videoId: 'old-video' } } },
    })
    const req = await createPayloadRequest({ payload })
    await setStoredStream(doc.id, { status: 'processing', videoId: 'new-video' })

    expect(
      await writeStoredStream({
        collection: COLLECTION,
        id: doc.id,
        req,
        stream: { status: 'ready', videoId: 'old-video' },
        whenStatus: 'processing',
      }),
    ).toBe(false)
    expect(
      await writeStoredStream({
        collection: COLLECTION,
        id: doc.id,
        req,
        stream: { status: 'failed', videoId: 'old-video' },
      }),
    ).toBe(false)
    expect(await storedStream(doc.id)).toMatchObject({ status: 'processing', videoId: 'new-video' })

    expect(
      await writeStoredStream({
        collection: COLLECTION,
        id: doc.id,
        req,
        stream: { status: 'ready', videoId: 'new-video' },
        whenStatus: 'processing',
      }),
    ).toBe(true)
    expect(await storedStream(doc.id)).toMatchObject({ status: 'ready', videoId: 'new-video' })

    await payload.db.deleteOne({ collection: COLLECTION, where: { id: { equals: doc.id } } })
  })

  it('fills the status of videos stored without one, also when they were saved before maxAge', async () => {
    const oldDate = '2020-01-01T00:00:00.000Z'
    const missing = await payload.db.create({
      collection: COLLECTION,
      data: {
        alt: 'No status',
        bunnyData: { stream: { videoId: '00000000-0000-0000-0000-000000000011' } },
        updatedAt: oldDate,
      },
    })
    const staleProcessing = await payload.db.create({
      collection: COLLECTION,
      data: {
        alt: 'Old processing',
        bunnyData: { stream: { status: 'processing', videoId: '00000000-0000-0000-0000-000000000012' } },
        updatedAt: oldDate,
      },
    })
    const noVideo = await payload.db.create({ collection: COLLECTION, data: { alt: 'No video', updatedAt: oldDate } })
    const actual = await vi.importActual<typeof import('@/server/bunny/stream.js')>('@/server/bunny/stream.js')
    const lookups: string[] = []
    vi.mocked(getStreamVideo).mockImplementation(async ({ videoId }) => {
      lookups.push(videoId)
      return { status: BunnyStreamVideoStatus.Finished } as never
    })

    try {
      expect(await syncStreamStatus({ payload })).toEqual({ checked: 1, failed: 0, hasMore: false, updated: 1 })
      expect(lookups).toEqual(['00000000-0000-0000-0000-000000000011'])
      expect((await storedStream(missing.id))?.status).toBe('ready')
      expect((await storedStream(staleProcessing.id))?.status).toBe('processing')

      expect(await syncStreamStatus({ payload })).toEqual({ checked: 0, failed: 0, hasMore: false, updated: 0 })
    } finally {
      vi.mocked(getStreamVideo).mockImplementation(actual.getStreamVideo)
      await payload.db.deleteMany({
        collection: COLLECTION,
        where: { id: { in: [missing.id, staleProcessing.id, noVideo.id] } },
      })
    }
  })

  it('checks every document once when they share an updatedAt and the page holds one', async () => {
    const updatedAt = new Date().toISOString()
    const videoIds = [
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
    ]
    const docs = await Promise.all(
      videoIds.map((videoId) =>
        payload.db.create({
          collection: COLLECTION,
          data: { alt: 'Cursor', bunnyData: { stream: { status: 'processing', videoId } }, updatedAt },
        }),
      ),
    )
    expect(new Set(docs.map((doc) => doc.updatedAt)).size).toBe(1)
    const actual = await vi.importActual<typeof import('@/server/bunny/stream.js')>('@/server/bunny/stream.js')
    const lookups: string[] = []
    vi.mocked(getStreamVideo).mockImplementation(async ({ videoId }) => {
      lookups.push(videoId)
      return { status: BunnyStreamVideoStatus.Processing } as never
    })

    try {
      const result = await syncStreamStatus({ limit: 1, payload })

      expect(result.checked + result.failed).toBe(3)
      expect(result.hasMore).toBe(false)
      expect(lookups.toSorted()).toEqual(videoIds)
    } finally {
      vi.mocked(getStreamVideo).mockImplementation(actual.getStreamVideo)
      await payload.db.deleteMany({
        collection: COLLECTION,
        where: { id: { in: docs.map((doc) => doc.id) } },
      })
    }
  })
})
