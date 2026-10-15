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

  it('stores the state of a video that only the latest draft version has', async () => {
    const drafts = 'status-sync-drafts'
    const earlier = new Date(Date.now() - 60_000).toISOString()
    const now = new Date().toISOString()
    const stream = (status: string, videoId: string) => ({ bunnyData: { stream: { status, videoId } } })
    const draftOnly = await payload.db.create({
      collection: drafts,
      data: { _status: 'published', alt: 'Draft only', ...stream('ready', 'sync-draft-main') },
    })
    const sameVideo = await payload.db.create({
      collection: drafts,
      data: { _status: 'published', alt: 'Same video', ...stream('processing', 'sync-draft-same') },
    })
    const createVersion = (parent: number | string, alt: string, data: Record<string, unknown>, at = now) =>
      payload.db.createVersion({
        autosave: false,
        collectionSlug: drafts,
        createdAt: at,
        parent,
        updatedAt: at,
        versionData: { _status: 'draft', alt, ...data } as never,
      })
    await createVersion(draftOnly.id, 'Old draft', stream('processing', 'sync-draft-old'), earlier)
    const draft = await createVersion(draftOnly.id, 'New draft', stream('processing', 'sync-draft-new'))
    const mirror = await createVersion(sameVideo.id, 'Same video', stream('processing', 'sync-draft-same'))
    const versionOf = async (id: number | string) =>
      (await payload.db.findVersions({ collection: drafts, pagination: false, where: { id: { equals: id } } })).docs[0]
    const before = await versionOf(draft.id)
    const mirrorBefore = await versionOf(mirror.id)
    const findVersions = payload.db.findVersions
    const scanned: unknown[][] = []
    const spy = vi.spyOn(payload.db, 'findVersions').mockImplementation(async (args) => {
      const found = await findVersions.call(payload.db, args)
      if (args.select) {
        scanned.push(found.docs)
      }
      return found
    })
    const actual = await vi.importActual<typeof import('@/server/bunny/stream.js')>('@/server/bunny/stream.js')
    const lookups: string[] = []
    vi.mocked(getStreamVideo).mockImplementation(async ({ videoId }) => {
      lookups.push(videoId)
      return { status: BunnyStreamVideoStatus.Finished } as never
    })

    try {
      const result = await syncStreamStatus({ payload })
      expect(lookups.toSorted()).toEqual(['sync-draft-new', 'sync-draft-same'])
      expect(result).toEqual({ checked: 2, failed: 0, hasMore: false, updated: 3 })
      expect(scanned).toHaveLength(1)
      expect(scanned[0]).toHaveLength(2)
      for (const row of scanned[0] as any[]) {
        expect(row.version.bunnyData.stream.videoId).toEqual(expect.any(String))
        expect(row.version.alt).toBeUndefined()
        expect(row.updatedAt).toEqual(expect.any(String))
      }
      expect(await versionOf(mirror.id)).toEqual({
        ...mirrorBefore,
        version: {
          ...mirrorBefore!.version,
          bunnyData: { stream: { status: 'ready', videoId: 'sync-draft-same' } },
        },
      })
      expect(await versionOf(draft.id)).toEqual({
        ...before,
        version: {
          ...before!.version,
          bunnyData: { stream: { status: 'ready', videoId: 'sync-draft-new' } },
        },
      })
      const mains = await payload.db.find({
        collection: drafts,
        pagination: false,
        where: { id: { in: [draftOnly.id, sameVideo.id] } },
      })
      expect(
        mains.docs.map((doc) => (doc as any).bunnyData.stream).toSorted((a, b) => a.videoId.localeCompare(b.videoId)),
      ).toEqual([
        { status: 'ready', videoId: 'sync-draft-main' },
        { status: 'ready', videoId: 'sync-draft-same' },
      ])

      expect(await syncStreamStatus({ payload })).toEqual({ checked: 0, failed: 0, hasMore: false, updated: 0 })
      expect(scanned).toEqual([expect.any(Array), []])
    } finally {
      spy.mockRestore()
      vi.mocked(getStreamVideo).mockImplementation(actual.getStreamVideo)
      await payload.db.deleteVersions({ collection: drafts, where: { parent: { in: [draftOnly.id, sameVideo.id] } } })
      await payload.db.deleteMany({ collection: drafts, where: { id: { in: [draftOnly.id, sameVideo.id] } } })
    }
  })
})
