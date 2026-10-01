import path from 'node:path'

import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getStorageUrl } from '@/shared/constants.js'

import { getPayload } from '../helpers/int/getPayload.js'
import { hasBunnyCredentials } from '../helpers/shared/credentials.js'

const imagePath = path.resolve(import.meta.dirname, '../fixtures/test-image.jpg')

const storageObjectStatus = async (objectPath: string): Promise<number> => {
  const response = await fetch(`${getStorageUrl()}/${process.env.BUNNY_STORAGE_ZONE_NAME}/${objectPath}`, {
    headers: { AccessKey: process.env.BUNNY_STORAGE_API_KEY || '' },
  })
  await response.body?.cancel()
  return response.status
}

describe.skipIf(!hasBunnyCredentials())('Storage', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload('storage')
  })

  afterAll(async () => {
    await payload.destroy()
  })

  it('uploads a file that is served by the CDN and removed from Bunny on delete', async () => {
    const doc = await payload.create({
      collection: 'storage-basic',
      data: { alt: 'Storage upload' },
      filePath: imagePath,
      overrideAccess: true,
    })
    const objectPath = `storage-basic/${doc.filename}`

    expect(doc.mimeType).toBe('image/jpeg')
    expect(doc.url).toContain('cdn=bunny')
    expect(doc.url).toContain('region=eu')
    expect(doc.thumbnailURL).toContain('class=thumbnail')
    expect(doc.thumbnailURL).toContain('version=2.0')
    expect(doc.thumbnailURL).toMatch(/[?&]t=\d+/)

    const served = await fetch(doc.url as string)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toContain('image/jpeg')
    expect(await storageObjectStatus(objectPath)).toBe(200)

    await payload.delete({ id: doc.id, collection: 'storage-basic', overrideAccess: true })

    expect(await storageObjectStatus(objectPath)).toBe(404)
  })

  it('applies per-collection thumbnail overrides', async () => {
    const custom = await payload.create({
      collection: 'thumbnail-custom',
      data: { alt: 'Custom thumbnail' },
      filePath: imagePath,
      overrideAccess: true,
    })
    const disabled = await payload.create({
      collection: 'thumbnail-disabled',
      data: { alt: 'No thumbnail' },
      filePath: imagePath,
      overrideAccess: true,
    })

    expect(custom.thumbnailURL).toContain('secure_thumb=true')
    expect(custom.thumbnailURL).toContain(`id=${custom.id}`)
    expect(disabled.thumbnailURL).toBeNull()

    await payload.delete({ id: custom.id, collection: 'thumbnail-custom', overrideAccess: true })
    await payload.delete({ id: disabled.id, collection: 'thumbnail-disabled', overrideAccess: true })
  })
})
