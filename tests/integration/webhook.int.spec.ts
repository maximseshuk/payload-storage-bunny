import { createHmac } from 'node:crypto'

import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { BunnyStreamVideoStatus, getReadyResolutions, getStreamVideo } from '@/server/bunny/stream.js'

import { cleanupStreamVideos, waitForVideoProcessed } from '../helpers/e2e/bunnyStream.js'
import { getPayload } from '../helpers/int/getPayload.js'
import { videoFile } from '../helpers/int/videoFile.js'
import { hasBunnyCredentials } from '../helpers/shared/credentials.js'

const WEBHOOK_SECRET = 'test-webhook-secret'

vi.mock('@/server/bunny/stream.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/bunny/stream.js')>()
  return {
    ...actual,
    getReadyResolutions: vi.fn(actual.getReadyResolutions),
    getStreamVideo: vi.fn(actual.getStreamVideo),
  }
})

describe.skipIf(!hasBunnyCredentials())('Stream webhook', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload('webhook')
  })

  afterAll(async () => {
    await cleanupStreamVideos(['webhook-test', 'webhook-drafts', 'webhook-plain', 'webhook-plain-drafts'])
    await payload.destroy()
  })

  const callWebhook = async (body: object) => {
    const endpoint = payload.config.endpoints?.find((e) => e.path === '/storage-bunny/stream/webhook')
    if (!endpoint) {
      throw new Error('Webhook endpoint not found')
    }

    const rawBody = JSON.stringify(body)
    const headers = new Headers({
      'Content-Type': 'application/json',
      'x-bunnystream-signature': createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex'),
      'x-bunnystream-signature-algorithm': 'hmac-sha256',
      'x-bunnystream-signature-version': 'v1',
    })

    return endpoint.handler({
      headers,
      payload,
      text: async () => rawBody,
      url: 'http://localhost/api/storage-bunny/stream/webhook',
    } as any)
  }

  it('updates bunnyData.stream.resolutions from the webhook', async () => {
    const upload = await payload.create({
      collection: 'webhook-test',
      data: { alt: 'Webhook test video' },
      file: await videoFile('webhook-test.mp4'),
      overrideAccess: true,
    })
    expect((upload.bunnyData as any)?.stream?.videoId).toBeTruthy()
    expect((upload.bunnyData as any).stream.status).toBe('processing')

    const videoId = (upload.bunnyData as any).stream.videoId as string
    expect(await waitForVideoProcessed(videoId, { resolutions: true })).toBe(true)
    const beforeWebhook = await payload.findByID({ id: upload.id, collection: 'webhook-test', overrideAccess: true })

    const response = await callWebhook({
      Status: 3,
      VideoGuid: videoId,
      VideoLibraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0'),
    })
    expect(response.status).toBe(200)

    const updatedDoc = await payload.findByID({
      id: upload.id,
      collection: 'webhook-test',
      showHiddenFields: true,
      overrideAccess: true,
    })
    expect((updatedDoc.bunnyData as any)?.stream?.resolutions).toBeTruthy()
    expect((updatedDoc.bunnyData as any).stream.resolutions.highest).toMatch(/^\d+p$/)
    expect((updatedDoc.bunnyData as any).stream.videoId).toBe(videoId)
    expect((updatedDoc.bunnyData as any).stream.status).toBe('ready')
    expect(updatedDoc.updatedAt).toBe(beforeWebhook.updatedAt)

    await payload.delete({ id: upload.id, collection: 'webhook-test', overrideAccess: true })
  }, 180000)

  it('stores the state of a webhook that arrives before the document exists', async () => {
    const videoId = `race-video-${Date.now()}`
    const findOne = vi.spyOn(payload.db, 'findOne')
    let createdId: number | string | undefined

    try {
      const raceLookups = () =>
        findOne.mock.calls.flatMap((args, index) =>
          args[0].collection === 'webhook-test' && JSON.stringify(args[0].where).includes(videoId)
            ? [findOne.mock.settledResults[index]]
            : [],
        )
      vi.mocked(getReadyResolutions).mockResolvedValueOnce({ available: ['720p'], highest: '720p' })
      const pendingResponse = callWebhook({
        Status: 3,
        VideoGuid: videoId,
        VideoLibraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0'),
      })

      await vi.waitFor(() => expect(raceLookups()[0]).toMatchObject({ type: 'fulfilled' }), { timeout: 2000 })
      const created = await payload.db.create({
        collection: 'webhook-test',
        data: {
          alt: 'Race video',
          bunnyData: { stream: { status: 'processing', videoId } },
          filename: `${videoId}.mp4`,
          mimeType: 'video/mp4',
        },
      })
      createdId = created.id

      const response = await pendingResponse
      expect(response.status).toBe(200)
      expect(raceLookups()[0]?.value).toBeFalsy()
      expect(raceLookups().length).toBeGreaterThanOrEqual(2)

      const doc = await payload.findByID({ id: created.id, collection: 'webhook-test', overrideAccess: true })
      expect((doc.bunnyData as any).stream).toMatchObject({
        resolutions: { available: ['720p'], highest: '720p' },
        status: 'ready',
        videoId,
      })
    } finally {
      findOne.mockRestore()
      vi.mocked(getReadyResolutions).mockReset()
      if (createdId !== undefined) {
        await payload.db.deleteOne({ collection: 'webhook-test', where: { id: { equals: createdId } } })
      }
    }
  }, 30000)

  it('clears the old resolutions when a save replaces the video with one that is still encoding', async () => {
    const oldVideoId = `old-video-${Date.now()}`
    const newVideoId = `new-video-${Date.now()}`
    const created = await payload.db.create({
      collection: 'webhook-test',
      data: {
        alt: 'Replaced video',
        bunnyData: {
          stream: { resolutions: { available: ['720p'], highest: '720p' }, status: 'ready', videoId: oldVideoId },
        },
        filename: `${oldVideoId}.mp4`,
        mimeType: 'video/mp4',
      },
    })
    vi.mocked(getStreamVideo).mockResolvedValueOnce({
      availableResolutions: null,
      guid: newVideoId,
      status: BunnyStreamVideoStatus.Transcoding,
      storageSize: 1,
      title: 'Replacement',
    } as any)

    try {
      await payload.update({
        id: created.id,
        collection: 'webhook-test',
        data: { bunnyData: { stream: { videoId: newVideoId } } } as any,
        overrideAccess: true,
      })

      const doc = await payload.findByID({ id: created.id, collection: 'webhook-test', overrideAccess: true })
      const stream = (doc.bunnyData as any).stream
      expect(stream).toMatchObject({ status: 'processing', videoId: newVideoId })
      expect(stream.resolutions ?? null).toBeNull()
    } finally {
      vi.mocked(getStreamVideo).mockReset()
      await payload.db.deleteOne({ collection: 'webhook-test', where: { id: { equals: created.id } } })
    }
  }, 30000)

  it('keeps the stored resolutions when the webhook stores only the state', async () => {
    const videoId = `failed-video-${Date.now()}`
    const resolutions = { available: ['720p'], highest: '720p' }
    const created = await payload.db.create({
      collection: 'webhook-test',
      data: {
        alt: 'Failed video',
        bunnyData: { stream: { resolutions, status: 'processing', videoId } },
        filename: `${videoId}.mp4`,
        mimeType: 'video/mp4',
      },
    })

    try {
      const response = await callWebhook({
        Status: 5,
        VideoGuid: videoId,
        VideoLibraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0'),
      })
      expect(response.status).toBe(200)

      const doc = await payload.findByID({ id: created.id, collection: 'webhook-test', overrideAccess: true })
      expect((doc.bunnyData as any).stream).toMatchObject({ resolutions, status: 'failed', videoId })
    } finally {
      await payload.db.deleteOne({ collection: 'webhook-test', where: { id: { equals: created.id } } })
    }
  })

  it('keeps a published document published when the status is off and the document has a newer draft', async () => {
    const videoId = `plain-draft-video-${Date.now()}`
    const created = await payload.db.create({
      collection: 'webhook-plain-drafts',
      data: {
        _status: 'published',
        alt: 'Published alt',
        bunnyData: { stream: { videoId } },
        filename: `${videoId}.mp4`,
        mimeType: 'video/mp4',
      },
    })

    try {
      await payload.update({
        id: created.id,
        collection: 'webhook-plain-drafts',
        data: { alt: 'Draft alt' },
        draft: true,
        overrideAccess: true,
      })
      const beforeWebhook = await payload.findByID({
        id: created.id,
        collection: 'webhook-plain-drafts',
        overrideAccess: true,
      })
      vi.mocked(getReadyResolutions).mockResolvedValueOnce({ available: ['720p'], highest: '720p' })

      const response = await callWebhook({
        Status: 3,
        VideoGuid: videoId,
        VideoLibraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0'),
      })
      expect(response.status).toBe(200)

      const published = await payload.findByID({
        id: created.id,
        collection: 'webhook-plain-drafts',
        overrideAccess: true,
      })
      expect(published).toMatchObject({ _status: 'published', alt: 'Published alt' })
      expect((published.bunnyData as any).stream).toMatchObject({
        resolutions: { available: ['720p'], highest: '720p' },
        videoId,
      })
      expect(published.updatedAt).toBe(beforeWebhook.updatedAt)

      const draft = await payload.findByID({
        id: created.id,
        collection: 'webhook-plain-drafts',
        draft: true,
        overrideAccess: true,
      })
      expect(draft.alt).toBe('Draft alt')
    } finally {
      vi.mocked(getReadyResolutions).mockReset()
      await payload.db.deleteVersions({ collection: 'webhook-plain-drafts', where: { parent: { equals: created.id } } })
      await payload.db.deleteOne({ collection: 'webhook-plain-drafts', where: { id: { equals: created.id } } })
    }
  }, 30000)

  it('keeps the webhook resolutions when the status is off and a draft without them is published', async () => {
    const videoId = `plain-publish-video-${Date.now()}`
    const created = await payload.db.create({
      collection: 'webhook-plain-drafts',
      data: {
        _status: 'published',
        alt: 'Published alt',
        bunnyData: { stream: { videoId } },
        filename: `${videoId}.mp4`,
        mimeType: 'video/mp4',
      },
    })

    try {
      await payload.update({
        id: created.id,
        collection: 'webhook-plain-drafts',
        data: { alt: 'Draft alt' },
        draft: true,
        overrideAccess: true,
      })
      vi.mocked(getReadyResolutions).mockResolvedValueOnce({ available: ['720p'], highest: '720p' })
      const response = await callWebhook({
        Status: 3,
        VideoGuid: videoId,
        VideoLibraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0'),
      })
      expect(response.status).toBe(200)

      await payload.update({
        id: created.id,
        collection: 'webhook-plain-drafts',
        data: { _status: 'published', alt: 'Draft alt', bunnyData: { stream: { resolutions: null, videoId } } } as any,
        overrideAccess: true,
      })

      const published = await payload.findByID({
        id: created.id,
        collection: 'webhook-plain-drafts',
        overrideAccess: true,
      })
      expect(published).toMatchObject({ _status: 'published', alt: 'Draft alt' })
      expect((published.bunnyData as any).stream).toMatchObject({
        resolutions: { available: ['720p'], highest: '720p' },
        videoId,
      })
    } finally {
      vi.mocked(getReadyResolutions).mockReset()
      await payload.db.deleteVersions({ collection: 'webhook-plain-drafts', where: { parent: { equals: created.id } } })
      await payload.db.deleteOne({ collection: 'webhook-plain-drafts', where: { id: { equals: created.id } } })
    }
  }, 30000)

  it('updates the resolutions straight in the database when the collection has the status turned off', async () => {
    const upload = await payload.create({
      collection: 'webhook-plain',
      data: { alt: 'Plain video' },
      file: await videoFile('webhook-plain.mp4'),
      overrideAccess: true,
    })

    try {
      const videoId = (upload.bunnyData as any).stream.videoId as string
      expect((upload.bunnyData as any).stream.status).toBeUndefined()
      expect(await waitForVideoProcessed(videoId, { resolutions: true })).toBe(true)
      const beforeWebhook = await payload.findByID({ id: upload.id, collection: 'webhook-plain', overrideAccess: true })

      const response = await callWebhook({
        Status: 3,
        VideoGuid: videoId,
        VideoLibraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0'),
      })
      expect(response.status).toBe(200)

      const updatedDoc = await payload.findByID({ id: upload.id, collection: 'webhook-plain', overrideAccess: true })
      const stream = (updatedDoc.bunnyData as any).stream
      expect(stream.resolutions.highest).toMatch(/^\d+p$/)
      expect(stream.status).toBeUndefined()
      expect(updatedDoc.updatedAt).toBe(beforeWebhook.updatedAt)
    } finally {
      await payload.delete({ id: upload.id, collection: 'webhook-plain', overrideAccess: true })
    }
  }, 180000)

  it('keeps the stored status and resolutions when a drafts collection publishes an edit', async () => {
    const upload = await payload.create({
      collection: 'webhook-drafts',
      data: { _status: 'published', alt: 'Drafts video' } as any,
      file: await videoFile('webhook-drafts.mp4'),
      overrideAccess: true,
    })

    try {
      const videoId = (upload.bunnyData as any).stream.videoId as string
      expect((upload.bunnyData as any).stream.status).toBe('processing')
      expect(await waitForVideoProcessed(videoId, { resolutions: true })).toBe(true)

      const response = await callWebhook({
        Status: 3,
        VideoGuid: videoId,
        VideoLibraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0'),
      })
      expect(response.status).toBe(200)

      const afterWebhook = await payload.findByID({ id: upload.id, collection: 'webhook-drafts', overrideAccess: true })
      const stream = (afterWebhook.bunnyData as any).stream
      expect(stream.status).toBe('ready')
      expect(stream.resolutions?.highest).toMatch(/^\d+p$/)

      await payload.update({
        id: upload.id,
        collection: 'webhook-drafts',
        data: { _status: 'published', alt: 'Drafts video edited', bunnyData: { stream: { videoId } } } as any,
        overrideAccess: true,
      })

      for (const draft of [false, true]) {
        const doc = await payload.findByID({ id: upload.id, collection: 'webhook-drafts', draft, overrideAccess: true })
        expect(doc.alt).toBe('Drafts video edited')
        expect((doc.bunnyData as any).stream).toMatchObject({
          resolutions: stream.resolutions,
          status: 'ready',
          videoId,
        })
      }
    } finally {
      await payload.delete({ id: upload.id, collection: 'webhook-drafts', overrideAccess: true })
    }
  }, 180000)

  it('stores the video of a first draft save in the main document, so a delete removes it', async () => {
    const upload = await payload.create({
      collection: 'webhook-drafts',
      data: { alt: 'First draft video' },
      draft: true,
      file: await videoFile('webhook-first-draft.mp4'),
      overrideAccess: true,
    })
    const videoId = (upload.bunnyData as any).stream.videoId as string
    expect(videoId).toBeTruthy()

    const main = await payload.findByID({ id: upload.id, collection: 'webhook-drafts', overrideAccess: true })
    expect(main._status).toBe('draft')
    expect((main.bunnyData as any).stream).toMatchObject({ status: 'processing', videoId })

    await payload.delete({ id: upload.id, collection: 'webhook-drafts', overrideAccess: true })
    await expect(
      getStreamVideo({
        apiKey: process.env.BUNNY_STREAM_API_KEY || '',
        libraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0'),
        videoId,
      }),
    ).rejects.toThrow(`Bunny Stream: Video not found: ${videoId}`)
  }, 60000)

  it('reports the encoding state through the status endpoint', async () => {
    const endpoint = payload.config.endpoints?.find((e) => e.path === '/storage-bunny/stream/status/:collection/:id')
    if (!endpoint) {
      throw new Error('Status endpoint not found')
    }

    const upload = await payload.create({
      collection: 'webhook-test',
      data: { alt: 'Status test video' },
      file: await videoFile('webhook-test-status.mp4'),
      overrideAccess: true,
    })

    try {
      const videoId = (upload.bunnyData as any).stream.videoId as string
      expect((upload.bunnyData as any).stream.status).toBe('processing')
      const { docs } = await payload.find({ collection: 'users', limit: 1, overrideAccess: true })

      const callStatus = async (id = String(upload.id)) => {
        const response = await endpoint.handler({
          payload,
          routeParams: { collection: 'webhook-test', id },
          t: (key: string) => key,
          user: { ...docs[0], collection: 'users' },
        } as any)
        return response.json()
      }

      await expect(callStatus('abc')).rejects.toMatchObject({ status: 404 })

      expect(await waitForVideoProcessed(videoId, { resolutions: true })).toBe(true)
      const beforeCheck = await payload.findByID({ id: upload.id, collection: 'webhook-test', overrideAccess: true })
      expect(await callStatus()).toMatchObject({ state: 'ready', resolutions: { available: expect.any(Array) } })

      const storedDoc = await payload.findByID({ id: upload.id, collection: 'webhook-test', overrideAccess: true })
      expect((storedDoc.bunnyData as any).stream).toMatchObject({ status: 'ready', videoId })
      expect(storedDoc.updatedAt).toBe(beforeCheck.updatedAt)
      expect(await callStatus()).toMatchObject({ state: 'ready', resolutions: { available: expect.any(Array) } })
    } finally {
      await payload.delete({ id: upload.id, collection: 'webhook-test', overrideAccess: true })
    }
  }, 180000)

  it('filters, sorts and selects documents by the stored Bunny Stream status', async () => {
    const statuses = ['ready', 'processing', 'failed'] as const
    const created = await Promise.all(
      statuses.map((status) =>
        payload.db.create({
          collection: 'webhook-test',
          data: {
            alt: `status-${status}`,
            bunnyData: { stream: { status, videoId: `status-video-${status}` } },
            filename: `status-${status}.mp4`,
            mimeType: 'video/mp4',
          },
        }),
      ),
    )
    const ids = created.map((doc) => doc.id)
    const inCreated = { id: { in: ids } }

    try {
      const processing = await payload.find({
        collection: 'webhook-test',
        overrideAccess: true,
        where: { and: [inCreated, { bunnyStream: { equals: 'processing' } }] },
      })
      expect(processing.docs.map((doc) => doc.alt)).toEqual(['status-processing'])
      expect((processing.docs[0] as any).bunnyStream).toBe('processing')

      const sorted = await payload.find({
        collection: 'webhook-test',
        overrideAccess: true,
        sort: 'bunnyStream',
        where: inCreated,
      })
      expect(sorted.docs.map((doc) => (doc as any).bunnyStream)).toEqual(['failed', 'processing', 'ready'])

      const selected = await payload.find({
        collection: 'webhook-test',
        overrideAccess: true,
        select: { filename: true },
        where: { and: [inCreated, { alt: { equals: 'status-ready' } }] },
      })
      expect((selected.docs[0] as any).bunnyData?.stream?.status).toBeUndefined()

      const listSelected = await payload.find({
        collection: 'webhook-test',
        overrideAccess: true,
        select: { bunnyStream: true, filename: true },
        where: { and: [inCreated, { alt: { equals: 'status-failed' } }] },
      })
      expect(listSelected.docs[0]).toMatchObject({
        bunnyData: { stream: { status: 'failed', videoId: 'status-video-failed' } },
        bunnyStream: 'failed',
      })

      const { docs: users } = await payload.find({ collection: 'users', limit: 1, overrideAccess: true })
      await payload.update({
        id: ids[0],
        collection: 'webhook-test',
        data: {
          alt: 'status-ready-updated',
          bunnyData: { stream: { videoId: 'status-video-ready' } },
          bunnyStream: 'failed',
        } as any,
        overrideAccess: false,
        user: { ...users[0], collection: 'users' },
      })
      const updated = await payload.findByID({ id: ids[0], collection: 'webhook-test', overrideAccess: true })
      expect(updated.alt).toBe('status-ready-updated')
      expect((updated as any).bunnyStream).toBe('ready')
      expect((updated.bunnyData as any).stream.status).toBe('ready')
    } finally {
      await payload.db.deleteMany({ collection: 'webhook-test', where: inCreated })
    }
  })
})
