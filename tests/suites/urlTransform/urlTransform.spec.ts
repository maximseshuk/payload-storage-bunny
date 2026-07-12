import path from 'node:path'

import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cleanupStreamVideos } from '../../helpers/bunnyStream.js'
import { getPayload } from '../../helpers/getPayload.js'

describe('URL Transform', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload('urlTransform')
  })

  afterAll(async () => {
    await cleanupStreamVideos([
      'url-transform-custom-video',
      'url-transform-static-video',
      'url-transform-global-video',
    ])
    await payload.destroy()
  })

  describe('Storage', () => {
    it('should apply global urlTransform with query params', async () => {
      const doc = await payload.create({
        collection: 'url-transform-global',
        data: { alt: 'Test URL transform with global config' },
        filePath: path.resolve(import.meta.dirname, '../../fixtures/test-image.jpg'),
      })

      expect(doc.id).toBeTruthy()
      expect(doc.url).toBeTruthy()
      expect(doc.url).toContain('cdn=bunny')
      expect(doc.url).toContain('region=eu')

      await payload.delete({
        id: doc.id,
        collection: 'url-transform-global',
      })
    })

    it('should apply global urlTransform without signed URLs when disabled', async () => {
      const doc = await payload.create({
        collection: 'url-transform-unsigned',
        data: { alt: 'Test URL transform without signed URLs' },
        filePath: path.resolve(import.meta.dirname, '../../fixtures/test-image.jpg'),
      })

      expect(doc.id).toBeTruthy()
      expect(doc.url).toBeTruthy()
      expect(doc.url).toContain('cdn=bunny')
      expect(doc.url).toContain('region=eu')
      expect(doc.url).not.toMatch(/token=/)

      await payload.delete({
        id: doc.id,
        collection: 'url-transform-unsigned',
      })
    })
  })

  describe('Stream', () => {
    it('should apply custom urlTransform.transformUrl to stream video', async () => {
      const doc = await payload.create({
        collection: 'url-transform-custom',
        data: {
          alt: 'Test stream URL transform',
          filename: 'url-transform-custom-video.mp4',
        },
        filePath: path.resolve(import.meta.dirname, '../../fixtures/test-video.mp4'),
      })

      expect(doc.id).toBeTruthy()
      expect(doc.url).toBeTruthy()
      expect(doc.url).toContain('quality=hd')
      expect(doc.url).toMatch(/session=[a-z0-9]+/)
      expect(doc.url).toContain('secure=true')
      expect(doc.url).toContain('/playlist.m3u8')

      await payload.delete({
        id: doc.id,
        collection: 'url-transform-custom',
      })
    }, 60000)

    it('should serve stream video with MP4 fallback URL', async () => {
      const doc = await payload.create({
        collection: 'url-transform-static',
        data: {
          alt: 'Test static handler for stream video',
          filename: 'url-transform-static-video.mp4',
        },
        filePath: path.resolve(import.meta.dirname, '../../fixtures/test-video.mp4'),
      })

      expect(doc.id).toBeTruthy()
      expect(doc.url).toBeTruthy()
      expect(doc.url).toContain('cdn=bunny')
      expect(doc.url).toContain('region=eu')
      expect(doc.url).toContain('.mp4')
      expect(doc.url).not.toContain('/playlist.m3u8')
      expect(doc.url).not.toMatch(/bcdn_token=/)

      await payload.delete({
        id: doc.id,
        collection: 'url-transform-static',
      })
    }, 60000)

    it('should apply global urlTransform to stream video', async () => {
      const doc = await payload.create({
        collection: 'url-transform-global',
        data: {
          alt: 'Test stream signed URL',
          filename: 'url-transform-global-video.mp4',
        },
        filePath: path.resolve(import.meta.dirname, '../../fixtures/test-video.mp4'),
      })

      expect(doc.id).toBeTruthy()
      expect(doc.url).toBeTruthy()
      expect(doc.url).toContain('cdn=bunny')
      expect(doc.url).toContain('region=eu')
      expect(doc.url).toContain('/playlist.m3u8')

      await payload.delete({
        id: doc.id,
        collection: 'url-transform-global',
      })
    }, 60000)
  })
})
