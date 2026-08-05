import type { CollectionConfig, Payload } from 'payload'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bunnyGroupField, getAfterReadHook } from '@/server/payload/fields/bunnyGroupField.js'
import type { CollectionContext } from '@/shared/types/index.js'

import { buildConfigWithDefaults } from '../../../../helpers/shared/buildConfigWithDefaults.js'

const SLUG = 'bunny-afterread-regression'
const streamContext = { streamConfig: { libraryId: 4242, mp4Fallback: true } } as unknown as CollectionContext

const collection: CollectionConfig = {
  slug: SLUG,
  fields: [bunnyGroupField(streamContext), { name: 'title', type: 'text' }],
  hooks: { afterRead: [getAfterReadHook()] },
}

describe('bunnyData afterRead — non-video doc in a stream-enabled collection', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config: await buildConfigWithDefaults({ collections: [collection] }) })
  })

  afterAll(async () => {
    await payload?.destroy?.()
  })

  it('create, read, list and delete of a doc without a videoId do not throw', async () => {
    const created = await payload.create({ collection: SLUG, data: { title: 'no video' } })
    expect(created.bunnyData).toBeNull()

    const read = await payload.findByID({ collection: SLUG, id: created.id })
    expect(read.bunnyData).toBeNull()

    const list = await payload.find({ collection: SLUG, where: { id: { equals: created.id } } })
    expect(list.docs[0]?.bunnyData).toBeNull()

    const deleted = await payload.delete({ collection: SLUG, id: created.id })
    expect(deleted.id).toBe(created.id)
  })

  it('keeps bunnyData for a doc that has a videoId', async () => {
    const created = await payload.create({
      collection: SLUG,
      data: { title: 'has video', bunnyData: { stream: { videoId: 'vid-123' } } },
    })
    expect(created.bunnyData).toMatchObject({ type: 'stream', stream: { videoId: 'vid-123', libraryId: 4242 } })

    await payload.delete({ collection: SLUG, id: created.id })
  })
})
