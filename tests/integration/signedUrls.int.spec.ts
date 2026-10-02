import path from 'node:path'

import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cleanupStreamVideos, waitForVideoProcessed } from '../helpers/e2e/bunnyStream.js'
import { getPayload } from '../helpers/int/getPayload.js'
import { videoFile } from '../helpers/int/videoFile.js'
import { hasSignedBunnyCredentials } from '../helpers/shared/credentials.js'

describe.skipIf(!hasSignedBunnyCredentials())('Signed URLs', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload('signing')
  })

  afterAll(async () => {
    await cleanupStreamVideos(['signed-stream-url-test'], { envPrefix: 'SIGNED' })
    await payload.destroy()
  })

  describe('Storage', () => {
    it('generates signed URL with token and expires params', async () => {
      const doc = await payload.create({
        collection: 'storageMedia',
        data: { alt: 'Signed storage URL test' },
        filePath: path.resolve(import.meta.dirname, '../fixtures/test-image.jpg'),
        overrideAccess: true,
      })

      expect(doc.id).toBeTruthy()
      expect(doc.url).toBeTruthy()
      expect(doc.url).toContain('token=')
      expect(doc.url).toContain('expires=')

      await payload.delete({
        id: doc.id,
        collection: 'storageMedia',
        overrideAccess: true,
      })
    })

    it('signed URL is accessible', async () => {
      const doc = await payload.create({
        collection: 'storageMedia',
        data: { alt: 'Signed storage URL accessibility test' },
        filePath: path.resolve(import.meta.dirname, '../fixtures/test-image.jpg'),
        overrideAccess: true,
      })

      expect(doc.url).toBeTruthy()

      const response = await fetch(doc.url as string)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('image')

      await payload.delete({
        id: doc.id,
        collection: 'storageMedia',
        overrideAccess: true,
      })
    })
  })

  describe('Stream', () => {
    it('generates signed URL with bcdn_token and is accessible', async () => {
      const doc = await payload.create({
        collection: 'streamMedia',
        data: { alt: 'Signed stream URL test' },
        file: await videoFile('signed-stream-url-test.mp4'),
        overrideAccess: true,
      })

      expect(doc.id).toBeTruthy()
      expect(doc.bunnyData).toBeTruthy()
      expect(doc.bunnyData.stream?.videoId).toBeTruthy()

      const videoId = doc.bunnyData.stream.videoId as string
      const processed = await waitForVideoProcessed(videoId, { envPrefix: 'SIGNED' })
      expect(processed).toBe(true)

      const freshDoc = await payload.findByID({
        id: doc.id,
        collection: 'streamMedia',
        overrideAccess: true,
      })

      expect(freshDoc.url).toBeTruthy()
      expect(freshDoc.url).toContain('bcdn_token=')
      expect(freshDoc.url).toContain('expires=')
      expect(freshDoc.url).toContain('playlist.m3u8')

      const response = await fetch(freshDoc.url as string, { headers: { Referer: 'https://example.com/' } })
      expect(response.status).toBe(200)

      await payload.delete({
        id: doc.id,
        collection: 'streamMedia',
        overrideAccess: true,
      })
    }, 180000)
  })
})
