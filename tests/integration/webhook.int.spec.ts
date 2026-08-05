import { createHmac } from 'node:crypto'
import path from 'node:path'

import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cleanupStreamVideos, waitForVideoProcessed } from '../helpers/e2e/bunnyStream.js'
import { getPayload } from '../helpers/int/getPayload.js'
import { hasBunnyCredentials } from '../helpers/shared/credentials.js'

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

  const callWebhook = async (
    body: object,
    signSecret: null | string = WEBHOOK_SECRET,
    { algorithm = 'hmac-sha256', version = 'v1' }: { algorithm?: null | string; version?: null | string } = {},
  ) => {
    const endpoint = payload.config.endpoints?.find((e) => e.path === '/storage-bunny/stream/webhook')
    if (!endpoint) {
      throw new Error('Webhook endpoint not found')
    }

    const url = 'http://localhost/api/storage-bunny/stream/webhook'
    const rawBody = JSON.stringify(body)
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (signSecret) {
      headers.set('x-bunnystream-signature', createHmac('sha256', signSecret).update(rawBody).digest('hex'))
    }
    if (version) {
      headers.set('x-bunnystream-signature-version', version)
    }
    if (algorithm) {
      headers.set('x-bunnystream-signature-algorithm', algorithm)
    }

    return endpoint.handler({ headers, payload, text: async () => rawBody, url } as any)
  }

  describe('Authentication', () => {
    const libraryId = parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0')
    const baseBody = { Status: 3, VideoGuid: 'test-guid', VideoLibraryId: libraryId }

    it('should reject without a signature or with a wrong-secret signature', async () => {
      const noSignature = await callWebhook(baseBody, null)
      expect(noSignature.status).toBe(401)

      const wrongSecret = await callWebhook(baseBody, 'wrong')
      expect(wrongSecret.status).toBe(401)
    })

    it('should reject an unsupported signature version or algorithm', async () => {
      const wrongVersion = await callWebhook({ ...baseBody, VideoGuid: 'non-existent-guid' }, WEBHOOK_SECRET, {
        version: 'v2',
      })
      expect(wrongVersion.status).toBe(401)

      const wrongAlgorithm = await callWebhook({ ...baseBody, VideoGuid: 'non-existent-guid' }, WEBHOOK_SECRET, {
        algorithm: 'hmac-sha1',
      })
      expect(wrongAlgorithm.status).toBe(401)

      const missingHeaders = await callWebhook({ ...baseBody, VideoGuid: 'non-existent-guid' }, WEBHOOK_SECRET, {
        algorithm: null,
        version: null,
      })
      expect(missingHeaders.status).toBe(401)
    })

    it('should reject with wrong library ID', async () => {
      const response = await callWebhook({ ...baseBody, VideoLibraryId: 99999 })
      expect(response.status).toBe(403)
    })

    it('should accept with a valid signature and library ID', async () => {
      const response = await callWebhook({ ...baseBody, VideoGuid: 'non-existent-guid' })
      expect(response.status).toBe(200)
    })
  })

  describe('Video Resolution Update', () => {
    it('should update bunnyData.stream.resolutions on webhook', async () => {
      const libraryId = parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0')

      const upload = await payload.create({
        collection: 'webhook-test',
        data: { alt: 'Webhook test video' },
        filePath: path.resolve(import.meta.dirname, '../fixtures/test-video.mp4'),
      })
      expect((upload.bunnyData as any)?.stream?.videoId).toBeTruthy()

      const videoId = (upload.bunnyData as any).stream.videoId as string
      await waitForVideoProcessed(videoId)

      const response = await callWebhook({
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
