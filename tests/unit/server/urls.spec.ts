import { describe, expect, it } from 'vitest'

import { getObjectFolder } from '@/server/urls.js'

describe('getObjectFolder', () => {
  const doc = {
    _objectKey: 'k-main',
    filename: 'photo.jpg',
    original: { _objectKey: 'k-original', filename: 'photo-original.jpg', prefix: 'media' },
    prefix: 'media',
    variants: { thumb: { _objectKey: 'k-thumb', filename: 'photo-4x4.jpg', prefix: 'thumbs' } },
  }

  it('joins the prefix and object key of the main file', () => {
    expect(getObjectFolder(doc)).toBe('media/k-main')
  })

  it('uses only the location of the representation it gets', () => {
    expect(getObjectFolder(doc, doc.original)).toBe('media/k-original')
    expect(getObjectFolder(doc, doc.variants.thumb)).toBe('thumbs/k-thumb')
    expect(getObjectFolder(doc, { filename: 'photo-8x8.jpg' })).toBe('')
  })

  it('falls back to the document location for a legacy document without an original', () => {
    const legacy = { filename: 'photo.jpg', prefix: 'legacy', variants: { thumb: { filename: 'photo-4x4.jpg' } } }

    expect(getObjectFolder(legacy)).toBe('legacy')
    expect(getObjectFolder(legacy, legacy.variants.thumb)).toBe('legacy')
  })

  it('returns an empty folder for an empty document', () => {
    expect(getObjectFolder(undefined)).toBe('')
    expect(getObjectFolder({ _objectKey: '', prefix: '' })).toBe('')
  })
})
