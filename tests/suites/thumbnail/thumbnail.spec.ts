import fs from 'node:fs/promises'
import path from 'node:path'

import { getFileByPath, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cleanupStreamVideos } from '../../helpers/bunnyStream.js'
import { getPayload } from '../../helpers/getPayload.js'

describe('Thumbnail', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload('thumbnail')
  })

  afterAll(async () => {
    await cleanupStreamVideos(['thumbnail-stream-static', 'thumbnail-stream-animated'])
    await payload.destroy()
  })

  describe('Storage', () => {
    it('should apply global thumbnail config with query params and timestamp', async () => {
      const doc = await payload.create({
        collection: 'thumbnail-global',
        data: { alt: 'Test thumbnail with global config' },
        filePath: path.resolve(import.meta.dirname, '../../fixtures/test-image.jpg'),
      })

      expect(doc.id).toBeTruthy()
      expect(doc.thumbnailURL).toBeTruthy()
      expect(doc.thumbnailURL).toContain('class=thumbnail')
      expect(doc.thumbnailURL).toContain('version=2.0')
      expect(doc.thumbnailURL).toMatch(/[?&]t=\d+/)

      await payload.delete({
        id: doc.id,
        collection: 'thumbnail-global',
      })
    })

    it('should apply custom thumbnail.transformUrl with custom query params', async () => {
      const doc = await payload.create({
        collection: 'thumbnail-custom',
        data: { alt: 'Test thumbnail with custom transform' },
        filePath: path.resolve(import.meta.dirname, '../../fixtures/test-image.jpg'),
      })

      expect(doc.id).toBeTruthy()
      expect(doc.thumbnailURL).toBeTruthy()
      expect(doc.thumbnailURL).toContain('secure_thumb=true')
      expect(doc.thumbnailURL).toContain(`id=${doc.id}`)
      expect(doc.thumbnailURL).toMatch(/[?&]t=\d+/)

      await payload.delete({
        id: doc.id,
        collection: 'thumbnail-custom',
      })
    })

    it('should not include thumbnailURL when thumbnail is disabled', async () => {
      const doc = await payload.create({
        collection: 'thumbnail-disabled',
        data: { alt: 'Test without thumbnail' },
        filePath: path.resolve(import.meta.dirname, '../../fixtures/test-image.jpg'),
      })

      expect(doc.id).toBeTruthy()
      expect(doc.thumbnailURL).toBeNull()

      await payload.delete({
        id: doc.id,
        collection: 'thumbnail-disabled',
      })
    })
  })

  describe('Stream', () => {
    it('should use thumbnail.jpg when streamAnimated is disabled', async () => {
      const videoFile = await getFileByPath(path.resolve(import.meta.dirname, '../../fixtures/test-video.mp4'))

      if (!videoFile) {
        throw new Error('Video file not found')
      }

      videoFile.name = 'thumbnail-stream-static.mp4'

      const createdDoc = await payload.create({
        collection: 'thumbnail-stream-static',
        data: { alt: 'Test stream thumbnail static' },
        file: videoFile,
      })

      const doc = await payload.findByID({
        id: createdDoc.id,
        collection: 'thumbnail-stream-static',
      })

      expect(doc.id).toBeTruthy()
      expect(doc.thumbnailURL).toBeTruthy()
      expect(doc.thumbnailURL).toContain('thumbnail.jpg')
      expect(doc.thumbnailURL).not.toContain('preview.webp')
      expect(doc.thumbnailURL).toContain('class=thumbnail')
      expect(doc.thumbnailURL).toContain('version=2.0')

      await payload.delete({
        id: doc.id,
        collection: 'thumbnail-stream-static',
      })
    }, 60000)

    it('should use preview.webp when streamAnimated is enabled', async () => {
      const videoPath = path.resolve(import.meta.dirname, '../../fixtures/test-video.mp4')
      const videoBuffer = await fs.readFile(videoPath)

      const doc = await payload.create({
        collection: 'thumbnail-stream-animated',
        data: { alt: 'Test stream thumbnail animated' },
        file: {
          name: 'thumbnail-stream-animated.mp4',
          data: videoBuffer,
          mimetype: 'video/mp4',
          size: videoBuffer.length,
        },
      })

      expect(doc.id).toBeTruthy()
      expect(doc.thumbnailURL).toBeTruthy()
      expect(doc.thumbnailURL).toContain('preview.webp')
      expect(doc.thumbnailURL).not.toContain('thumbnail.jpg')

      await payload.delete({
        id: doc.id,
        collection: 'thumbnail-stream-animated',
      })
    }, 60000)
  })
})
