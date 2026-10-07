import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { resolveSignedURLKey } from '@payloadcms/plugin-cloud-storage/utilities'
import type { Payload } from 'payload'
import { createPayloadRequest } from 'payload'
import { getFileFromUploadInstructions } from 'payload/internal'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { uploadStorageFile } from '@/server/bunny/storage.js'
import { createStreamVideo, deleteStreamVideo, getStreamVideo } from '@/server/bunny/stream.js'
import { HTTPError } from '@/server/http/index.js'
import { streamUploadSessionsCollectionSlug } from '@/server/payload/stream/sessionsCollection.js'
import { getStorageUrl } from '@/shared/constants.js'

import { cleanupStreamVideos } from '../helpers/e2e/bunnyStream.js'
import { getPayload } from '../helpers/int/getPayload.js'
import { videoFile } from '../helpers/int/videoFile.js'
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
    await cleanupStreamVideos(['cleanup-test-replace'])
    await payload.destroy()
  })

  const isVideoDeleted = async (videoId: string) => {
    for (let i = 0; i < 10; i++) {
      try {
        await getStreamVideo({ apiKey, libraryId, videoId })
      } catch (err) {
        if (!(err instanceof Error && err.cause instanceof HTTPError && err.cause.response.status === 404)) {
          throw err
        }
        return true
      }
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
    return false
  }

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

    expect(await isVideoDeleted(orphan.guid)).toBe(true)
  }, 60000)

  it('forgets the Stream video when a Storage client upload replaces it', async () => {
    const doc = await payload.create({
      collection: 'cleanup-test',
      data: { alt: 'Replaced by an image' },
      disableTransaction: true,
      file: await videoFile('cleanup-test-replace.mp4'),
      overrideAccess: true,
    })
    const videoId = (doc.bunnyData as { stream: { videoId: string } }).stream.videoId
    expect(videoId).toBeTruthy()

    const image = await readFile(path.resolve(import.meta.dirname, '../fixtures/test-image.jpg'))
    const req = await createPayloadRequest({ payload })
    const {
      sanitizedFilename,
      storageFilePath: objectPath,
      uploadReference,
    } = await resolveSignedURLKey({
      collectionPrefix: 'cleanup-test',
      collectionSlug: 'cleanup-test',
      filename: 'photo.jpg',
      req,
    })
    const storage = {
      apiKey: process.env.BUNNY_STORAGE_API_KEY || '',
      zoneName: process.env.BUNNY_STORAGE_ZONE_NAME || '',
    }
    const objectStatus = async () => {
      const response = await fetch(`${getStorageUrl()}/${storage.zoneName}/${objectPath}`, {
        headers: { AccessKey: storage.apiKey },
      })
      await response.body?.cancel()
      return response.status
    }
    await uploadStorageFile({ ...storage, buffer: image, mimeType: 'image/jpeg', path: objectPath })
    const file = await getFileFromUploadInstructions({
      collectionSlug: 'cleanup-test',
      file: { filename: sanitizedFilename, mimeType: 'image/jpeg', size: image.length, uploadReference },
      req,
    })

    const updated = await payload.update({
      id: doc.id,
      collection: 'cleanup-test',
      data: {},
      file: file as never,
      overrideAccess: true,
      req,
    })

    const stored = (await payload.db.findOne({ collection: 'cleanup-test', where: { id: { equals: doc.id } } })) as {
      bunnyData?: { stream?: { videoId?: null | string } }
    }
    expect(stored.bunnyData?.stream?.videoId ?? null).toBeNull()
    expect(updated.mimeType).toBe('image/jpeg')
    expect(updated.url).toContain(`/${objectPath}`)
    expect(await isVideoDeleted(videoId)).toBe(true)

    await payload.delete({ id: doc.id, collection: 'cleanup-test', overrideAccess: true })

    expect(await objectStatus()).toBe(404)
  }, 120000)

  it('forgets the Stream video when a server upload replaces it and returns no Stream data', async () => {
    const doc = await payload.create({
      collection: 'cleanup-test',
      data: { alt: 'Replaced by an image on the server' },
      disableTransaction: true,
      file: await videoFile('cleanup-test-replace-server.mp4'),
      overrideAccess: true,
    })
    const videoId = (doc.bunnyData as { stream: { videoId: string } }).stream.videoId
    expect(videoId).toBeTruthy()

    const image = await readFile(path.resolve(import.meta.dirname, '../fixtures/test-image.jpg'))
    const updated = await payload.update({
      id: doc.id,
      collection: 'cleanup-test',
      data: {},
      file: { data: image, mimetype: 'image/jpeg', name: 'server-photo.jpg', size: image.length } as never,
      overrideAccess: true,
    })

    const stored = (await payload.db.findOne({ collection: 'cleanup-test', where: { id: { equals: doc.id } } })) as {
      bunnyData?: { stream?: { videoId?: null | string } }
    }
    expect(stored.bunnyData?.stream?.videoId ?? null).toBeNull()
    expect(updated.mimeType).toBe('image/jpeg')
    expect(updated.bunnyData).toBeUndefined()
    expect(await isVideoDeleted(videoId)).toBe(true)

    await payload.delete({ id: doc.id, collection: 'cleanup-test', overrideAccess: true })
  }, 120000)
})
