import path from 'node:path'

import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cleanupStreamVideos, waitForVideoProcessed } from '../../helpers/bunnyStream.js'
import { hasBunnyCredentials } from '../../helpers/credentials.js'
import { getPayload } from '../../helpers/getPayload.js'

const WEBHOOK_SECRET = 'test-webhook-secret'

describe.skipIf(!hasBunnyCredentials())('Stream Webhook', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload('webhook')
  })

  afterAll(async () => {
    await cleanupStreamVideos(['webhook-test'])
    await payload.destroy()
  })

  const callWebhook = async (url: string, body: object) => {
    const endpoint = payload.config.endpoints?.find((e) => e.path === '/storage-bunny/stream/webhook')
    if (!endpoint) {
      throw new Error('Webhook endpoint not found')
    }

    const req = new Request(url, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })

    return endpoint.handler({ ...req, json: () => req.json(), payload, url } as any)
  }

  describe('Authentication', () => {
    const libraryId = parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0')
    const baseBody = { Status: 3, VideoGuid: 'test-guid', VideoLibraryId: libraryId }

    it('should reject without secret or with wrong secret', async () => {
      const noSecret = await callWebhook('http://localhost/api/storage-bunny/stream/webhook', baseBody)
      expect(noSecret.status).toBe(401)

      const wrongSecret = await callWebhook('http://localhost/api/storage-bunny/stream/webhook?secret=wrong', baseBody)
      expect(wrongSecret.status).toBe(401)
    })

    it('should reject with wrong library ID', async () => {
      const response = await callWebhook(`http://localhost/api/storage-bunny/stream/webhook?secret=${WEBHOOK_SECRET}`, {
        ...baseBody,
        VideoLibraryId: 99999,
      })
      expect(response.status).toBe(403)
    })

    it('should accept with correct secret and library ID', async () => {
      const response = await callWebhook(`http://localhost/api/storage-bunny/stream/webhook?secret=${WEBHOOK_SECRET}`, {
        ...baseBody,
        VideoGuid: 'non-existent-guid',
      })
      expect(response.status).toBe(200)
    })
  })

  describe('Video Resolution Update', () => {
    it('should update bunnyData.stream.resolutions on webhook', async () => {
      const libraryId = parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0')

      const upload = await payload.create({
        collection: 'webhook-test',
        data: { alt: 'Webhook test video' },
        filePath: path.resolve(import.meta.dirname, '../../fixtures/test-video.mp4'),
      })
      expect((upload.bunnyData as any)?.stream?.videoId).toBeTruthy()

      const videoId = (upload.bunnyData as any).stream.videoId as string
      await waitForVideoProcessed(videoId)

      const response = await callWebhook(`http://localhost/api/storage-bunny/stream/webhook?secret=${WEBHOOK_SECRET}`, {
        Status: 3,
        VideoGuid: videoId,
        VideoLibraryId: libraryId,
      })
      expect(response.status).toBe(200)

      const updatedDoc = await payload.findByID({
        id: upload.id,
        collection: 'webhook-test',
        showHiddenFields: true,
      })
      expect((updatedDoc.bunnyData as any)?.stream?.resolutions).toBeTruthy()
      expect((updatedDoc.bunnyData as any).stream.resolutions.highest).toMatch(/^\d+p$/)

      await payload.delete({ id: upload.id, collection: 'webhook-test' })
    }, 180000)
  })
})
