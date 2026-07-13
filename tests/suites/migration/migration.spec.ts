import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrateBunnyData } from '@/migrations/index.js'

import { getPayload } from '../../helpers/getPayload.js'

const slug = 'migration-media'

type NativeCollection = {
  deleteMany: (filter: Record<string, unknown>) => Promise<unknown>
  findOne: (filter: Record<string, unknown>) => Promise<Record<string, any> | null>
  insertMany: (docs: Record<string, unknown>[]) => Promise<unknown>
}

describe('Bunny data migration (mongodb)', () => {
  let payload: Payload

  const native = (): NativeCollection =>
    (payload.db as unknown as { collections: Record<string, { collection: NativeCollection }> }).collections[slug]
      .collection

  beforeAll(async () => {
    payload = await getPayload('migration')
    await native().deleteMany({})
    await native().insertMany([
      {
        alt: 'video with meta',
        bunnyVideoId: 'vid-1',
        bunnyVideoMeta: { availableMp4Resolutions: ['720p', '480p'], highestMp4Resolution: '720p' },
        filename: 'a.mp4',
        mimeType: 'video/mp4',
      },
      {
        alt: 'video without meta',
        bunnyVideoId: 'vid-2',
        filename: 'b.mp4',
        mimeType: 'video/mp4',
      },
      {
        alt: 'plain image',
        filename: 'c.jpg',
        mimeType: 'image/jpeg',
      },
    ])
  })

  afterAll(async () => {
    await native().deleteMany({})
    await payload.destroy()
  })

  it('migrates legacy fields into bunnyData.stream', async () => {
    const result = await migrateBunnyData({ payload })

    expect(result.adapter).toBe('mongoose')
    expect(result.collections.find((c) => c.slug === slug)?.changed).toBe(2)

    const withMeta = await native().findOne({ bunnyVideoId: 'vid-1' })
    expect(withMeta?.bunnyData.stream.videoId).toBe('vid-1')
    expect(withMeta?.bunnyData.stream.resolutions).toEqual({ available: ['720p', '480p'], highest: '720p' })

    const withoutMeta = await native().findOne({ bunnyVideoId: 'vid-2' })
    expect(withoutMeta?.bunnyData.stream.videoId).toBe('vid-2')
    expect(withoutMeta?.bunnyData.stream.resolutions).toBeUndefined()

    const image = await native().findOne({ filename: 'c.jpg' })
    expect(image?.bunnyData).toBeUndefined()
  })

  it('is idempotent on a second run', async () => {
    const result = await migrateBunnyData({ payload })
    expect(result.collections.find((c) => c.slug === slug)?.changed).toBe(0)
  })

  it('drops legacy fields with drop:true', async () => {
    await migrateBunnyData({ payload, drop: true })

    const doc = await native().findOne({ 'bunnyData.stream.videoId': 'vid-1' })
    expect(doc?.bunnyVideoId).toBeUndefined()
    expect(doc?.bunnyVideoMeta).toBeUndefined()
    expect(doc?.bunnyData.stream.videoId).toBe('vid-1')
  })

  it('restores legacy fields on rollback', async () => {
    const result = await migrateBunnyData({ payload, direction: 'rollback' })
    expect(result.collections.find((c) => c.slug === slug)?.changed).toBe(2)

    const doc = await native().findOne({ 'bunnyData.stream.videoId': 'vid-1' })
    expect(doc?.bunnyVideoId).toBe('vid-1')
    expect(doc?.bunnyVideoMeta).toEqual({ availableMp4Resolutions: ['720p', '480p'], highestMp4Resolution: '720p' })
  })
})
