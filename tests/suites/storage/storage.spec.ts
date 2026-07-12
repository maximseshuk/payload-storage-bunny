import path from 'node:path'

import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getPayload } from '../../helpers/getPayload.js'

describe('Storage - Upload and Delete', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload('storage')
  })

  afterAll(async () => {
    await payload.destroy()
  })

  it('should upload and delete image file', async () => {
    const doc = await payload.create({
      collection: 'storage-basic',
      data: { alt: 'Test image alt text' },
      filePath: path.resolve(import.meta.dirname, '../../fixtures/test-image.jpg'),
      showHiddenFields: true,
    })

    console.log('doc', doc)

    expect(doc.id).toBeTruthy()
    expect(doc.filename).toBeTruthy()
    expect(doc.url).toBeTruthy()
    expect(doc.mimeType).toBe('image/jpeg')

    await payload.delete({
      id: doc.id,
      collection: 'storage-basic',
    })

    const found = await payload.find({
      collection: 'storage-basic',
      where: { id: { equals: doc.id } },
    })
    expect(found.totalDocs).toBe(0)
  })

  it('should upload and delete text document', async () => {
    const doc = await payload.create({
      collection: 'storage-basic',
      data: { alt: 'Test document alt text' },
      filePath: path.resolve(import.meta.dirname, '../../fixtures/test-document.txt'),
      showHiddenFields: true,
    })

    console.log('doc', doc)

    expect(doc.id).toBeTruthy()
    expect(doc.filename).toBeTruthy()
    expect(doc.url).toBeTruthy()
    expect(doc.mimeType).toBe('text/plain')

    await payload.delete({
      id: doc.id,
      collection: 'storage-basic',
    })

    const found = await payload.find({
      collection: 'storage-basic',
      where: { id: { equals: doc.id } },
    })
    expect(found.totalDocs).toBe(0)
  })
})
