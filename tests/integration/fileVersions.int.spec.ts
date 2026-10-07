import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { Payload, PayloadRequest } from 'payload'
import { createPayloadRequest } from 'payload'
import { getFileFromUploadInstructions } from 'payload/internal'
import { S3mini } from 's3mini'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getS3Endpoint } from '@/server/bunny/s3.js'
import { storageFileExists } from '@/server/bunny/storage.js'
import {
  createStreamVideo,
  deleteStreamVideo,
  getStreamVideo,
  listStreamVideos,
  uploadStreamVideo,
} from '@/server/bunny/stream.js'
import { HTTPError } from '@/server/http/index.js'
import { signStreamVideoToken } from '@/server/payload/stream/tusSignature.js'
import type { StreamTusAuthResponse, StreamTusUploadData } from '@/shared/types/index.js'

import { cleanupStreamVideos, waitForVideoProcessed } from '../helpers/e2e/bunnyStream.js'
import { getPayload } from '../helpers/int/getPayload.js'
import { videoFile } from '../helpers/int/videoFile.js'
import { hasBunnyCredentials, hasS3StorageCredentials } from '../helpers/shared/credentials.js'

type Representation = { _objectKey?: null | string; filename?: null | string; prefix?: null | string }
type UploadDoc = Representation & {
  bunnyData?: { stream?: { status?: null | string; videoId?: null | string } }
  filesize?: null | number
  mimeType?: null | string
  id: number | string
  original?: Representation
  url?: null | string
  variants?: Record<string, Representation>
}

const imagePath = path.resolve(import.meta.dirname, '../fixtures/test-image.jpg')
const videoPath = path.resolve(import.meta.dirname, '../fixtures/test-video.mp4')
const secondImagePath = path.resolve(import.meta.dirname, '../fixtures/test-image-2.jpg')
const storage = { apiKey: process.env.BUNNY_STORAGE_API_KEY || '', zoneName: process.env.BUNNY_STORAGE_ZONE_NAME || '' }
const stream = {
  apiKey: process.env.BUNNY_STREAM_API_KEY || '',
  libraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0', 10),
}
const collections = [
  'fv-storage',
  'fv-storage-pruned',
  'fv-storage-unversioned',
  'fv-stream',
  'fv-stream-client',
  'fv-stream-drafts',
  'fv-stream-pruned',
  'fv-s3',
] as const

const keysOf = (doc: UploadDoc): string[] => [
  ...new Set(
    [doc, doc.original, ...Object.values(doc.variants ?? {})]
      .filter((representation) => representation?.filename)
      .map((representation) =>
        [representation!.prefix, representation!._objectKey, representation!.filename].filter(Boolean).join('/'),
      ),
  ),
]

const existing = async (keys: string[]): Promise<string[]> => {
  const found: string[] = []
  for (const key of keys) {
    if (await storageFileExists({ ...storage, path: key })) {
      found.push(key)
    }
  }
  return found
}

const videoIdOf = (doc: UploadDoc): string => doc.bunnyData?.stream?.videoId ?? ''

const videoExists = async (videoId: string): Promise<boolean> => {
  try {
    await getStreamVideo({ ...stream, videoId })
    return true
  } catch (err) {
    if (err instanceof Error && err.cause instanceof HTTPError && err.cause.response.status === 404) {
      return false
    }
    throw err
  }
}

const isVideoDeleted = async (videoId: string): Promise<boolean> => {
  for (let i = 0; i < 10; i++) {
    if (!(await videoExists(videoId))) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  return false
}

describe.skipIf(!hasBunnyCredentials())('file versions', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload('fileVersions')
  })

  afterAll(async () => {
    for (const collection of collections) {
      if (payload.collections[collection]) {
        await payload.delete({ collection, overrideAccess: true, where: { id: { exists: true } } })
      }
    }
    await cleanupStreamVideos(['fv-stream', 'fv-legacy'])
    await payload.destroy()
  })

  const firstVersionId = async (collection: string, id: number | string) => {
    const { docs } = await payload.findVersions({
      collection,
      overrideAccess: true,
      sort: 'createdAt',
      where: { parent: { equals: id } },
    })
    return docs[0]!.id
  }

  it('keeps a replaced Storage file for its version, restores and renames it, and deletes every file', async () => {
    const created = (await payload.create({
      collection: 'fv-storage',
      data: { alt: 'First' },
      filePath: imagePath,
      overrideAccess: true,
    })) as UploadDoc
    const firstKeys = keysOf(created)
    expect(firstKeys.length).toBeGreaterThan(1)
    expect(firstKeys.every((key) => key.startsWith(`fv-storage/${created._objectKey}/`))).toBe(true)
    expect(await existing(firstKeys)).toEqual(firstKeys)

    const replaced = (await payload.update({
      id: created.id,
      collection: 'fv-storage',
      data: {},
      filePath: secondImagePath,
      overrideAccess: true,
    })) as UploadDoc
    const replacedKeys = keysOf(replaced)
    expect(replaced._objectKey).not.toBe(created._objectKey)
    expect(await existing(replacedKeys)).toEqual(replacedKeys)
    expect(await existing(firstKeys)).toEqual(firstKeys)

    const restored = (await payload.restoreVersion({
      id: await firstVersionId('fv-storage', created.id),
      collection: 'fv-storage',
      overrideAccess: true,
    })) as UploadDoc
    const restoredKeys = keysOf(restored)
    expect(restored.filename).toMatch(/^test-image/)
    expect(restoredKeys).not.toEqual(firstKeys)
    expect(await existing(restoredKeys)).toEqual(restoredKeys)
    expect((await fetch(restored.url!)).status).toBe(200)

    const renamed = (await payload.renameFile({
      id: created.id,
      collection: 'fv-storage',
      filename: 'renamed.jpg',
      overrideAccess: true,
    })) as UploadDoc
    const renamedKeys = keysOf(renamed)
    expect(renamed.filename).toMatch(/^renamed/)
    expect(await existing(renamedKeys)).toEqual(renamedKeys)
    expect(await existing(restoredKeys)).toEqual(restoredKeys)

    await payload.delete({ id: created.id, collection: 'fv-storage', overrideAccess: true })

    expect(await existing([...firstKeys, ...replacedKeys, ...restoredKeys, ...renamedKeys])).toEqual([])
  }, 120000)

  it('deletes a replaced Storage file once maxPerDoc prunes its last version', async () => {
    const created = (await payload.create({
      collection: 'fv-storage-pruned',
      data: { alt: 'Pruned' },
      filePath: imagePath,
      overrideAccess: true,
    })) as UploadDoc
    const createdKeys = keysOf(created)
    expect(createdKeys.length).toBeGreaterThan(1)
    expect(await existing(createdKeys)).toEqual(createdKeys)

    const replaced = (await payload.update({
      id: created.id,
      collection: 'fv-storage-pruned',
      data: {},
      filePath: secondImagePath,
      overrideAccess: true,
    })) as UploadDoc

    expect(await existing(createdKeys)).toEqual([])
    expect(await existing(keysOf(replaced))).toEqual(keysOf(replaced))

    await payload.delete({ id: created.id, collection: 'fv-storage-pruned', overrideAccess: true })

    expect(await existing(keysOf(replaced))).toEqual([])
  }, 60000)

  it('deletes and purges a replaced Storage file in a collection without versions', async () => {
    const created = (await payload.create({
      collection: 'fv-storage-unversioned',
      data: { alt: 'Unversioned' },
      filePath: imagePath,
      overrideAccess: true,
    })) as UploadDoc
    const createdKeys = keysOf(created)
    expect(createdKeys.length).toBeGreaterThan(1)
    expect(await existing(createdKeys)).toEqual(createdKeys)
    expect((await fetch(created.url!)).status).toBe(200)

    const replaced = (await payload.update({
      id: created.id,
      collection: 'fv-storage-unversioned',
      data: {},
      filePath: secondImagePath,
      overrideAccess: true,
    })) as UploadDoc

    expect(await existing(createdKeys)).toEqual([])
    expect(await existing(keysOf(replaced))).toEqual(keysOf(replaced))
    await expect.poll(async () => (await fetch(created.url!)).status, { interval: 2_000, timeout: 30_000 }).toBe(404)

    await payload.delete({ id: created.id, collection: 'fv-storage-unversioned', overrideAccess: true })

    expect(await existing(keysOf(replaced))).toEqual([])
  }, 60000)

  it('keeps a replaced Stream video for its version, restores and renames without a copy, and deletes every video', async () => {
    const created = (await payload.create({
      collection: 'fv-stream',
      data: { alt: 'First video' },
      file: await videoFile('fv-stream-first.mp4'),
      overrideAccess: true,
    })) as UploadDoc
    const firstVideoId = videoIdOf(created)
    expect(firstVideoId).toBeTruthy()
    expect((await getStreamVideo({ ...stream, videoId: firstVideoId })).title).toBe('fv-stream-first.mp4')

    const replaced = (await payload.update({
      id: created.id,
      collection: 'fv-stream',
      data: {},
      file: await videoFile('fv-stream-second.mp4'),
      overrideAccess: true,
    })) as UploadDoc
    const secondVideoId = videoIdOf(replaced)
    expect(secondVideoId).toBeTruthy()
    expect(secondVideoId).not.toBe(firstVideoId)
    expect(await videoExists(firstVideoId)).toBe(true)

    const restored = (await payload.restoreVersion({
      id: await firstVersionId('fv-stream', created.id),
      collection: 'fv-stream',
      overrideAccess: true,
    })) as UploadDoc
    expect(videoIdOf(restored)).toBe(firstVideoId)
    expect(restored.url).toContain(firstVideoId)

    const renamed = (await payload.renameFile({
      id: created.id,
      collection: 'fv-stream',
      filename: 'fv-stream-renamed.mp4',
      overrideAccess: true,
    })) as UploadDoc
    expect(renamed.filename).toMatch(/^fv-stream-renamed/)
    expect(videoIdOf(renamed)).toBe(firstVideoId)
    expect(await videoExists(secondVideoId)).toBe(true)

    await payload.delete({ id: created.id, collection: 'fv-stream', overrideAccess: true })

    expect(await isVideoDeleted(firstVideoId)).toBe(true)
    expect(await isVideoDeleted(secondVideoId)).toBe(true)
  }, 180000)

  it('stores the new video of a server-side replace made with access control and keeps the old one for its version', async () => {
    const {
      docs: [user],
    } = await payload.find({ collection: 'users', limit: 1, overrideAccess: true })
    const sessionUser = { ...user!, collection: 'users' } as PayloadRequest['user']
    const created = (await payload.create({
      collection: 'fv-stream',
      data: { alt: 'Replaced with access control' },
      file: await videoFile('fv-stream-access.mp4'),
      overrideAccess: true,
    })) as UploadDoc
    const videoIds = [videoIdOf(created)]

    for (let i = 0; i < 2; i++) {
      const replaced = (await payload.update({
        id: created.id,
        collection: 'fv-stream',
        data: {},
        file: await videoFile('fv-stream-access.mp4'),
        overrideAccess: false,
        user: sessionUser,
      })) as UploadDoc
      const stored = (await payload.findByID({
        id: created.id,
        collection: 'fv-stream',
        overrideAccess: true,
      })) as UploadDoc
      expect(videoIdOf(replaced)).not.toBe(videoIds.at(-1))
      expect(videoIdOf(stored)).toBe(videoIdOf(replaced))
      expect(stored.filename).toMatch(/^fv-stream-access-original(-\d+)?\.mp4$/)
      expect((await getStreamVideo({ ...stream, videoId: videoIdOf(stored) })).title).toBe('fv-stream-access.mp4')
      videoIds.push(videoIdOf(stored))
    }

    for (const videoId of videoIds) {
      expect(await videoExists(videoId)).toBe(true)
    }
    const { items } = await listStreamVideos({ ...stream, itemsPerPage: 1000 })
    expect(
      items
        .filter((video) => video.title === 'fv-stream-access.mp4')
        .map((video) => video.guid)
        .toSorted(),
    ).toEqual(videoIds.toSorted())

    await payload.delete({ id: created.id, collection: 'fv-stream', overrideAccess: true })

    for (const videoId of videoIds) {
      expect(await isVideoDeleted(videoId)).toBe(true)
    }
  }, 240000)

  it('keeps the video when a published or draft version of a drafts collection is restored', async () => {
    const created = (await payload.create({
      collection: 'fv-stream-drafts',
      data: { _status: 'published', alt: 'Draft video' },
      file: await videoFile('fv-stream-drafts-first.mp4'),
      overrideAccess: true,
    })) as UploadDoc
    const firstVideoId = videoIdOf(created)
    expect(firstVideoId).toBeTruthy()
    const firstVersion = await firstVersionId('fv-stream-drafts', created.id)

    const replaced = (await payload.update({
      id: created.id,
      collection: 'fv-stream-drafts',
      data: { _status: 'published' },
      file: await videoFile('fv-stream-drafts-second.mp4'),
      overrideAccess: true,
    })) as UploadDoc
    const secondVideoId = videoIdOf(replaced)
    expect(secondVideoId).toBeTruthy()
    expect(secondVideoId).not.toBe(firstVideoId)

    const published = (await payload.restoreVersion({
      id: firstVersion,
      collection: 'fv-stream-drafts',
      overrideAccess: true,
    })) as UploadDoc
    expect(videoIdOf(published)).toBe(firstVideoId)
    expect(published.url).toContain(firstVideoId)
    expect(
      videoIdOf(
        (await payload.findByID({ id: created.id, collection: 'fv-stream-drafts', overrideAccess: true })) as UploadDoc,
      ),
    ).toBe(firstVideoId)

    const draft = (await payload.restoreVersion({
      id: firstVersion,
      collection: 'fv-stream-drafts',
      draft: true,
      overrideAccess: true,
    })) as UploadDoc
    expect(videoIdOf(draft)).toBe(firstVideoId)
    expect(draft.url).toContain(firstVideoId)
    expect(await videoExists(firstVideoId)).toBe(true)
    expect(await videoExists(secondVideoId)).toBe(true)

    await payload.delete({ id: created.id, collection: 'fv-stream-drafts', overrideAccess: true })

    expect(await isVideoDeleted(firstVideoId)).toBe(true)
    expect(await isVideoDeleted(secondVideoId)).toBe(true)
  }, 180000)

  it('keeps the TUS video when a version of an autosaved drafts document is restored', async () => {
    const {
      docs: [user],
    } = await payload.find({ collection: 'users', limit: 1, overrideAccess: true })
    const sessionUser = { ...user!, collection: 'users' } as PayloadRequest['user']
    const buffer = await readFile(videoPath)
    const tusVideo = async (title: string) => {
      const video = await createStreamVideo({ ...stream, title })
      await uploadStreamVideo({ ...stream, buffer, videoId: video.guid })
      const videoToken = signStreamVideoToken({
        collection: 'fv-stream-drafts',
        libraryId: stream.libraryId,
        secret: payload.secret,
        user: sessionUser,
        videoId: video.guid,
      })
      return { videoId: video.guid, videoToken }
    }

    const first = await tusVideo('fv-stream-drafts-tus-first.mp4')
    const created = (await payload.create({
      collection: 'fv-stream-drafts',
      data: { alt: 'TUS draft', bunnyData: { stream: first } },
      draft: true,
      overrideAccess: false,
      user: sessionUser,
    })) as UploadDoc
    expect(videoIdOf(created)).toBe(first.videoId)
    const firstVersion = await firstVersionId('fv-stream-drafts', created.id)

    const second = await tusVideo('fv-stream-drafts-tus-second.mp4')
    await payload.update({
      id: created.id,
      autosave: true,
      collection: 'fv-stream-drafts',
      data: { bunnyData: { stream: second } },
      draft: true,
      overrideAccess: false,
      user: sessionUser,
    })
    await payload.update({
      id: created.id,
      collection: 'fv-stream-drafts',
      data: { _status: 'published' },
      overrideAccess: false,
      user: sessionUser,
    })

    for (const draft of [false, true]) {
      const restored = (await payload.restoreVersion({
        id: firstVersion,
        collection: 'fv-stream-drafts',
        draft,
        overrideAccess: false,
        user: sessionUser,
      })) as UploadDoc
      expect(videoIdOf(restored)).toBe(first.videoId)
      expect(restored.url).toContain(first.videoId)
      expect(await videoExists(first.videoId)).toBe(true)
    }

    await payload.delete({ id: created.id, collection: 'fv-stream-drafts', overrideAccess: true })

    expect(await isVideoDeleted(first.videoId)).toBe(true)
    expect(await isVideoDeleted(second.videoId)).toBe(true)
  }, 180000)

  it('keeps or fills the file fields when an autosave sends the TUS video with empty file fields', async () => {
    const {
      docs: [user],
    } = await payload.find({ collection: 'users', limit: 1, overrideAccess: true })
    const sessionUser = { ...user!, collection: 'users' } as PayloadRequest['user']
    const buffer = await readFile(videoPath)
    const tusVideo = async (title: string) => {
      const video = await createStreamVideo({ ...stream, title })
      await uploadStreamVideo({ ...stream, buffer, videoId: video.guid })
      const videoToken = signStreamVideoToken({
        collection: 'fv-stream-drafts',
        libraryId: stream.libraryId,
        secret: payload.secret,
        user: sessionUser,
        videoId: video.guid,
      })
      return { videoId: video.guid, videoToken }
    }
    const autosave = async (id: number | string, data: Record<string, unknown>) => {
      await payload.update({
        id,
        autosave: true,
        collection: 'fv-stream-drafts',
        data,
        draft: true,
        overrideAccess: false,
        user: sessionUser,
      })
      return (await payload.findByID({
        id,
        collection: 'fv-stream-drafts',
        draft: true,
        overrideAccess: true,
      })) as UploadDoc
    }
    const empty = { filename: null, filesize: null, mimeType: null }

    const first = await tusVideo('fv-stream-drafts-meta-first.mp4')
    const created = (await payload.create({
      collection: 'fv-stream-drafts',
      data: { alt: 'TUS metadata', bunnyData: { stream: first } },
      draft: true,
      overrideAccess: false,
      user: sessionUser,
    })) as UploadDoc
    expect(created).toMatchObject({ filename: 'fv-stream-drafts-meta-first-original.mp4', mimeType: 'video/mp4' })
    expect(created.filesize).toBeGreaterThan(0)

    const kept = await autosave(created.id, { alt: 'Typed', bunnyData: { stream: first }, ...empty })
    expect(kept).toMatchObject({
      alt: 'Typed',
      filename: created.filename,
      filesize: created.filesize,
      mimeType: 'video/mp4',
    })
    expect(videoIdOf(kept)).toBe(first.videoId)

    const second = await tusVideo('fv-stream-drafts-meta-second.mp4')
    const filled = await autosave(created.id, { bunnyData: { stream: second }, ...empty })
    expect(videoIdOf(filled)).toBe(second.videoId)
    expect(filled).toMatchObject({ filename: 'fv-stream-drafts-meta-second-original.mp4', mimeType: 'video/mp4' })
    expect(filled.filesize).toBeGreaterThan(0)

    await payload.delete({ id: created.id, collection: 'fv-stream-drafts', overrideAccess: true })

    expect(await isVideoDeleted(first.videoId)).toBe(true)
    expect(await isVideoDeleted(second.videoId)).toBe(true)
  }, 180000)

  it('refreshes the video status from Bunny when a version is restored', async () => {
    const created = (await payload.create({
      collection: 'fv-stream',
      data: { alt: 'Status restore' },
      file: await videoFile('fv-stream-status-first.mp4'),
      overrideAccess: true,
    })) as UploadDoc
    const firstVideoId = videoIdOf(created)
    expect(created.bunnyData?.stream?.status).toBe('processing')
    const firstVersion = await firstVersionId('fv-stream', created.id)
    expect(await waitForVideoProcessed(firstVideoId, { timeout: 150000 })).toBe(true)

    const replaced = (await payload.update({
      id: created.id,
      collection: 'fv-stream',
      data: {},
      file: await videoFile('fv-stream-status-second.mp4'),
      overrideAccess: true,
    })) as UploadDoc
    expect(videoIdOf(replaced)).not.toBe(firstVideoId)

    const restored = (await payload.restoreVersion({
      id: firstVersion,
      collection: 'fv-stream',
      overrideAccess: true,
    })) as UploadDoc
    expect(videoIdOf(restored)).toBe(firstVideoId)
    expect(restored.bunnyData?.stream?.status).toBe('ready')

    await payload.delete({ id: created.id, collection: 'fv-stream', overrideAccess: true })
  }, 240000)

  it('deletes a TUS video once an autosave replaces its last reference in place', async () => {
    const {
      docs: [user],
    } = await payload.find({ collection: 'users', limit: 1, overrideAccess: true })
    const sessionUser = { ...user!, collection: 'users' } as PayloadRequest['user']
    const buffer = await readFile(videoPath)
    const tusVideo = async (title: string) => {
      const video = await createStreamVideo({ ...stream, title })
      await uploadStreamVideo({ ...stream, buffer, videoId: video.guid })
      const videoToken = signStreamVideoToken({
        collection: 'fv-stream-drafts',
        libraryId: stream.libraryId,
        secret: payload.secret,
        user: sessionUser,
        videoId: video.guid,
      })
      return { videoId: video.guid, videoToken }
    }
    const autosave = (id: number | string, data: Record<string, unknown>) =>
      payload.update({
        id,
        autosave: true,
        collection: 'fv-stream-drafts',
        data,
        draft: true,
        overrideAccess: false,
        user: sessionUser,
      })

    const created = (await payload.create({
      collection: 'fv-stream-drafts',
      data: { alt: 'Autosave' },
      draft: true,
      overrideAccess: false,
      user: sessionUser,
    })) as UploadDoc
    const first = await tusVideo('fv-stream-drafts-autosave-first.mp4')
    await autosave(created.id, { bunnyData: { stream: first } })
    const second = await tusVideo('fv-stream-drafts-autosave-second.mp4')
    await autosave(created.id, { alt: 'Autosave edited', bunnyData: { stream: first } })
    expect(await videoExists(first.videoId)).toBe(true)

    await autosave(created.id, { bunnyData: { stream: second } })
    expect(await isVideoDeleted(first.videoId)).toBe(true)
    expect(await videoExists(second.videoId)).toBe(true)

    await payload.delete({ id: created.id, collection: 'fv-stream-drafts', overrideAccess: true })

    expect(await isVideoDeleted(second.videoId)).toBe(true)
  }, 180000)

  it('deletes a replaced Stream video once maxPerDoc prunes its last version', async () => {
    const created = (await payload.create({
      collection: 'fv-stream-pruned',
      data: { alt: 'Pruned video' },
      file: await videoFile('fv-stream-pruned-first.mp4'),
      overrideAccess: true,
    })) as UploadDoc
    const firstVideoId = videoIdOf(created)
    expect(firstVideoId).toBeTruthy()
    expect(await videoExists(firstVideoId)).toBe(true)

    const replaced = (await payload.update({
      id: created.id,
      collection: 'fv-stream-pruned',
      data: {},
      file: await videoFile('fv-stream-pruned-second.mp4'),
      overrideAccess: true,
    })) as UploadDoc

    const secondVideoId = videoIdOf(replaced)
    expect(secondVideoId).toBeTruthy()
    expect(await isVideoDeleted(firstVideoId)).toBe(true)
    expect(await videoExists(secondVideoId)).toBe(true)

    await payload.delete({ id: created.id, collection: 'fv-stream-pruned', overrideAccess: true })

    expect(await isVideoDeleted(secondVideoId)).toBe(true)
  }, 120000)

  it('creates a document from a TUS video with only its videoId and token and names the file after the video title', async () => {
    const {
      docs: [user],
    } = await payload.find({ collection: 'users', limit: 1, overrideAccess: true })
    const sessionUser = { ...user!, collection: 'users' } as PayloadRequest['user']
    const video = await createStreamVideo({ ...stream, title: 'fv-stream-tus-title.mp4' })
    const buffer = await readFile(videoPath)
    await uploadStreamVideo({ ...stream, buffer, videoId: video.guid })
    const videoToken = signStreamVideoToken({
      collection: 'fv-stream',
      libraryId: stream.libraryId,
      secret: payload.secret,
      user: sessionUser,
      videoId: video.guid,
    })

    const doc = (await payload.create({
      collection: 'fv-stream',
      data: { alt: 'TUS video', bunnyData: { stream: { videoId: video.guid, videoToken } } },
      overrideAccess: false,
      user: sessionUser,
    })) as UploadDoc & { filesize?: number; mimeType?: string }

    expect(videoIdOf(doc)).toBe(video.guid)
    expect(doc.filename).toBe('fv-stream-tus-title-original.mp4')
    expect(doc.prefix).toBe('fv-stream')
    expect(doc._objectKey).toMatch(/^[\da-f-]{36}$/)
    expect(doc.original).toMatchObject({ _objectKey: doc._objectKey, filename: doc.filename, prefix: 'fv-stream' })
    expect(doc.mimeType).toBe('video/mp4')
    expect(doc.filesize).toEqual(expect.any(Number))
    expect(doc.url).toContain(video.guid)

    await payload.delete({ id: doc.id, collection: 'fv-stream', overrideAccess: true })

    expect(await isVideoDeleted(video.guid)).toBe(true)
  }, 120000)

  it('saves a TUS upload made through tus-auth with the size of the finished upload', async () => {
    const endpoint = payload.config.endpoints?.find((e) => e.path === '/storage-bunny/stream/tus-auth')
    if (!endpoint) {
      throw new Error('tus-auth endpoint not found')
    }
    const {
      docs: [user],
    } = await payload.find({ collection: 'users', limit: 1, overrideAccess: true })
    const sessionUser = { ...user!, collection: 'users' } as PayloadRequest['user']
    const buffer = await readFile(videoPath)
    const tusAuth = async (body: Record<string, unknown>) => {
      const req = await createPayloadRequest({
        payload,
        req: { json: async () => ({ collection: 'fv-stream', filetype: 'video/mp4', ...body }) },
        user: sessionUser,
      })
      return (await (await endpoint.handler(req)).json()) as StreamTusAuthResponse
    }
    const patch = async ({ headers, uploadUrl }: StreamTusUploadData, offset: number, body: Buffer) =>
      (
        await fetch(uploadUrl, {
          body: new Uint8Array(body),
          headers: {
            ...headers,
            'Content-Type': 'application/offset+octet-stream',
            'Tus-Resumable': '1.0.0',
            'Upload-Offset': String(offset),
          },
          method: 'PATCH',
        })
      ).status
    const asUpload = (auth: StreamTusAuthResponse) => {
      if (auth.type !== 'upload') {
        throw new Error(`Unexpected tus-auth response: ${auth.type}`)
      }
      return { ...auth, errorMessage: '' }
    }
    const save = (auth: StreamTusAuthResponse) =>
      payload.create({
        collection: 'fv-stream',
        data: { alt: 'TUS view', bunnyData: { stream: { videoId: auth.videoId, videoToken: auth.videoToken } } },
        overrideAccess: false,
        user: sessionUser,
      }) as Promise<UploadDoc>

    const tusViewVideos = async () =>
      (await listStreamVideos(stream)).items
        .filter((video) => video.title?.startsWith('fv-stream-tus-view'))
        .map((video) => video.guid)
        .toSorted()

    const smaller = asUpload(await tusAuth({ filename: 'fv-stream-tus-view-smaller.mp4', filesize: buffer.length - 1 }))
    expect(await patch(smaller, 0, buffer)).toBe(413)

    const auth = asUpload(
      await tusAuth({
        filename: 'fv-stream-tus-view.mp4',
        filesize: buffer.length,
        videoId: smaller.videoId,
        videoToken: smaller.videoToken,
      }),
    )
    expect(auth.videoId).not.toBe(smaller.videoId)
    expect(auth.uploadUrl).toMatch(/^https:\/\//)
    expect(auth.expiresIn).toBe(300)
    expect(await isVideoDeleted(smaller.videoId)).toBe(true)

    const videosBeforeRenew = await tusViewVideos()
    for (const body of [
      { filesize: buffer.length, videoId: auth.videoId, videoToken: 'f'.repeat(64) },
      { filesize: buffer.length + 1, videoId: auth.videoId, videoToken: auth.videoToken },
      { filesize: buffer.length - 1, videoId: smaller.videoId, videoToken: smaller.videoToken },
    ]) {
      await expect(tusAuth({ filename: 'fv-stream-tus-view.mp4', renew: true, ...body })).rejects.toMatchObject({
        status: 409,
      })
    }
    expect(await tusViewVideos()).toEqual(videosBeforeRenew)
    expect(videosBeforeRenew).toContain(auth.videoId)
    const half = Math.floor(buffer.length / 2)
    expect(await patch(auth, 0, buffer.subarray(0, half))).toBe(204)
    await expect(save(auth)).rejects.toMatchObject({
      data: { errors: [{ message: 'The video upload is not usable: the upload has not finished yet.' }] },
      status: 400,
    })

    const renewed = asUpload(
      await tusAuth({
        filename: 'fv-stream-tus-view.mp4',
        filesize: buffer.length,
        renew: true,
        videoId: auth.videoId,
        videoToken: auth.videoToken,
      }),
    )
    expect(renewed).toMatchObject({ uploadUrl: auth.uploadUrl, videoId: auth.videoId })
    expect(await patch(renewed, half, buffer.subarray(half))).toBe(204)
    expect(
      await tusAuth({
        filename: 'fv-stream-tus-view.mp4',
        filesize: buffer.length,
        renew: true,
        videoId: auth.videoId,
        videoToken: auth.videoToken,
      }),
    ).toMatchObject({ type: 'uploaded', videoId: auth.videoId })

    const doc = await save(auth)
    expect(videoIdOf(doc)).toBe(auth.videoId)
    expect(doc.filesize).toBe(buffer.length)

    await payload.delete({ id: doc.id, collection: 'fv-stream', overrideAccess: true })

    expect(await isVideoDeleted(auth.videoId)).toBe(true)
  }, 120000)

  it('deletes the video of a v3 Stream document that has no original in a collection with versions', async () => {
    const video = await createStreamVideo({ ...stream, title: 'fv-legacy.mp4' })
    await uploadStreamVideo({ ...stream, buffer: await readFile(videoPath), videoId: video.guid })
    const legacy = (await payload.db.create({
      collection: 'fv-stream',
      data: {
        alt: 'Legacy video',
        bunnyData: { stream: { videoId: video.guid } },
        filename: 'fv-legacy.mp4',
        filesize: 1,
        mimeType: 'video/mp4',
      },
    })) as UploadDoc
    expect(legacy.original?.filename ?? undefined).toBeUndefined()
    expect(payload.collections['fv-stream']!.config.versions).toBeTruthy()

    await payload.delete({ id: legacy.id, collection: 'fv-stream', overrideAccess: true })

    expect(await isVideoDeleted(video.guid)).toBe(true)
  }, 120000)

  it('creates a document from a TUS client upload whose receipt points at the video', async () => {
    const buffer = await readFile(videoPath)
    const req = await createPayloadRequest({ payload })
    const generate = async (filename: string, filesize: number) => {
      const instructions = await payload.collections['fv-stream-client']!.config.upload.uploadInstructions!.generate({
        collectionSlug: 'fv-stream-client',
        filename,
        filesize,
        mimeType: 'video/mp4',
        overrideAccess: true,
        req,
      })
      if (instructions.type !== 'dispatch') {
        throw new Error(`Unexpected upload instructions: ${instructions.type}`)
      }
      return { ...instructions, data: instructions.data as StreamTusUploadData }
    }
    const patch = async ({ headers, uploadUrl }: StreamTusUploadData, offset: number, body: Buffer) =>
      (
        await fetch(uploadUrl, {
          body: new Uint8Array(body),
          headers: {
            ...headers,
            'Content-Type': 'application/offset+octet-stream',
            'Tus-Resumable': '1.0.0',
            'Upload-Offset': String(offset),
          },
          method: 'PATCH',
        })
      ).status

    const smaller = await generate('fv-stream-client-smaller.mp4', buffer.length - 1)
    expect(await patch(smaller.data, 0, buffer)).toBe(413)
    await expect(
      getFileFromUploadInstructions({ collectionSlug: 'fv-stream-client', file: smaller.file, req }),
    ).rejects.toMatchObject({ message: 'Uploaded source is not readable.', status: 400 })
    await deleteStreamVideo({ ...stream, videoId: smaller.data.videoId })

    const instructions = await generate('fv-stream-client.mp4', buffer.length)
    const { videoId } = instructions.data
    expect(instructions.file.uploadReference._objectKey).toBe(videoId)

    const resolve = (file = instructions.file) =>
      getFileFromUploadInstructions({ collectionSlug: 'fv-stream-client', file, req })
    await expect(resolve()).rejects.toMatchObject({ message: 'Uploaded source is not readable.', status: 400 })

    const half = Math.floor(buffer.length / 2)
    expect(await patch(instructions.data, 0, buffer.subarray(0, half))).toBe(204)
    await expect(resolve()).rejects.toMatchObject({ message: 'Uploaded source is not readable.', status: 400 })

    expect(await patch(instructions.data, half, buffer.subarray(half))).toBe(204)
    await expect(resolve({ ...instructions.file, size: buffer.length + 1 })).rejects.toMatchObject({
      message: 'Uploaded source size does not match the declared size.',
      status: 400,
    })

    const file = await resolve()
    const created = (await payload.create({
      collection: 'fv-stream-client',
      data: { alt: 'Client video' },
      file: file as never,
      overrideAccess: true,
      req,
    })) as UploadDoc & { filesize?: number; mimeType?: string }

    expect(videoIdOf(created)).toBe(videoId)
    expect(created).toMatchObject({
      _objectKey: videoId,
      filename: 'fv-stream-client-original.mp4',
      filesize: buffer.length,
      mimeType: 'video/mp4',
      prefix: 'fv-stream-client',
    })
    expect(created.original).toMatchObject({
      _objectKey: videoId,
      filename: 'fv-stream-client-original.mp4',
      prefix: 'fv-stream-client',
    })
    expect(created.url).toContain(videoId)
    await expect(
      payload.create({
        collection: 'fv-stream-client',
        data: { alt: 'Reused receipt' },
        file: (await resolve()) as never,
        overrideAccess: true,
        req,
      }),
    ).rejects.toThrow('bunnyData.stream.videoId')

    const replaced = (await payload.update({
      id: created.id,
      collection: 'fv-stream-client',
      data: {},
      file: await videoFile('fv-stream-client-second.mp4'),
      overrideAccess: true,
    })) as UploadDoc
    const secondVideoId = videoIdOf(replaced)
    expect(secondVideoId).toBeTruthy()
    expect(secondVideoId).not.toBe(videoId)
    expect(await videoExists(videoId)).toBe(true)

    const restored = (await payload.restoreVersion({
      id: await firstVersionId('fv-stream-client', created.id),
      collection: 'fv-stream-client',
      overrideAccess: true,
    })) as UploadDoc
    expect(videoIdOf(restored)).toBe(videoId)

    const renamed = (await payload.renameFile({
      id: created.id,
      collection: 'fv-stream-client',
      filename: 'fv-stream-client-renamed.mp4',
      overrideAccess: true,
    })) as UploadDoc
    expect(renamed.filename).toMatch(/^fv-stream-client-renamed/)
    expect(videoIdOf(renamed)).toBe(videoId)

    await payload.delete({ id: created.id, collection: 'fv-stream-client', overrideAccess: true })

    expect(await isVideoDeleted(videoId)).toBe(true)
    expect(await isVideoDeleted(secondVideoId)).toBe(true)
  }, 180000)

  describe.skipIf(!hasS3StorageCredentials())('S3', () => {
    const s3 = () =>
      new S3mini({
        accessKeyId: process.env.BUNNY_S3_STORAGE_ZONE_NAME || '',
        endpoint: `${getS3Endpoint(process.env.BUNNY_S3_STORAGE_REGION || '')}/${process.env.BUNNY_S3_STORAGE_ZONE_NAME}`,
        region: process.env.BUNNY_S3_STORAGE_REGION || '',
        secretAccessKey: process.env.BUNNY_S3_STORAGE_API_KEY || '',
      })
    const existingS3 = async (keys: string[]): Promise<string[]> => {
      const found: string[] = []
      for (const key of keys) {
        if ((await s3().objectExists(key)) === true) {
          found.push(key)
        }
      }
      return found
    }

    it('creates a document from a presigned upload and renames it with CopyObject', async () => {
      const image = await readFile(imagePath)
      const req = await createPayloadRequest({ payload })
      const instructions = await payload.collections['fv-s3']!.config.upload.uploadInstructions!.generate({
        collectionSlug: 'fv-s3',
        filename: 'presigned.jpg',
        filesize: image.length,
        mimeType: 'application/octet-stream',
        overrideAccess: true,
        req,
      })
      if (instructions.type !== 'http') {
        throw new Error(`Unexpected upload instructions: ${instructions.type}`)
      }
      const { url, ...request } = instructions.request
      const upload = await fetch(url, { ...request, body: image })
      expect(upload.status).toBe(200)

      const file = await getFileFromUploadInstructions({ collectionSlug: 'fv-s3', file: instructions.file, req })
      const created = (await payload.create({
        collection: 'fv-s3',
        data: { alt: 'Presigned' },
        file: file as never,
        overrideAccess: true,
        req,
      })) as UploadDoc
      const createdKeys = keysOf(created)
      expect(created.prefix).toBe('fv-s3')
      expect(created.original?.filename).toBe('presigned-original.jpg')
      expect(await existingS3(createdKeys)).toEqual(createdKeys)

      const renamed = (await payload.renameFile({
        id: created.id,
        collection: 'fv-s3',
        filename: 'presigned-renamed.jpg',
        overrideAccess: true,
      })) as UploadDoc
      const renamedKeys = keysOf(renamed)
      expect(await existingS3(renamedKeys)).toEqual(renamedKeys)
      const copied = await s3().getObjectResponse(renamedKeys.find((key) => key.endsWith(renamed.original!.filename!))!)
      expect(copied?.headers.get('content-type')).toBe('application/octet-stream')
      await copied?.body?.cancel()

      await payload.delete({ id: created.id, collection: 'fv-s3', overrideAccess: true })

      expect(await existingS3([...createdKeys, ...renamedKeys])).toEqual([])
    }, 120000)
  })
})
