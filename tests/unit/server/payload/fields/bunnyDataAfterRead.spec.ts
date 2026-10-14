import type { CollectionConfig, Payload } from 'payload'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bunnyGroupField, getAfterReadHook } from '@/server/payload/fields/bunnyGroupField.js'
import type { CollectionContext } from '@/shared/types/index.js'

import { buildConfigWithDefaults } from '../../../../helpers/shared/buildConfigWithDefaults.js'

const SLUG = 'bunny-afterread-regression'
const streamContext = { streamOptions: { libraryId: 4242, mp4Fallback: true } } as unknown as CollectionContext

const collection: CollectionConfig = {
  slug: SLUG,
  fields: [bunnyGroupField(streamContext, true), { name: 'title', type: 'text' }],
  hooks: { afterRead: [getAfterReadHook()] },
}

describe('bunnyData afterRead for a non-video doc in a stream collection', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config: await buildConfigWithDefaults({ collections: [collection] }) })
  })

  afterAll(async () => {
    await payload?.destroy?.()
  })

  it('handles create, read, list and delete of a doc without a videoId', async () => {
    const created = await payload.create({ collection: SLUG, overrideAccess: true, data: { title: 'no video' } })
    expect(created.bunnyData).toBeUndefined()

    const read = await payload.findByID({ collection: SLUG, overrideAccess: true, id: created.id })
    expect(read.bunnyData).toBeUndefined()

    const list = await payload.find({ collection: SLUG, overrideAccess: true, where: { id: { equals: created.id } } })
    expect(list.docs[0]?.bunnyData).toBeUndefined()

    const deleted = await payload.delete({ collection: SLUG, overrideAccess: true, id: created.id })
    expect(deleted.id).toBe(created.id)
  })
})
