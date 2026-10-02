import { createHmac } from 'node:crypto'

import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cleanupStreamVideos, waitForVideoProcessed } from '../helpers/e2e/bunnyStream.js'
import { getPayload } from '../helpers/int/getPayload.js'
import { videoFile } from '../helpers/int/videoFile.js'
import { hasBunnyCredentials } from '../helpers/shared/credentials.js'

const WEBHOOK_SECRET = 'test-webhook-secret'

describe.skipIf(!hasBunnyCredentials())('Stream webhook', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload('webhook')
  })

  afterAll(async () => {
    await cleanupStreamVideos(['webhook-test'])
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

    const videoId = (upload.bunnyData as any).stream.videoId as string
    expect(await waitForVideoProcessed(videoId)).toBe(true)

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

    await payload.delete({ id: upload.id, collection: 'webhook-test', overrideAccess: true })
  }, 180000)
})
