import { describe, expect, it } from 'vitest'

import { intersectMimeTypes, isImage, matchesMimeTypePattern } from '@/utils/mimeTypes.js'

describe('isImage', () => {
  it('returns true for image/* types', () => {
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    imageTypes.forEach((type) => expect(isImage(type)).toBe(true))
  })

  it('returns false for non-image types', () => {
    const nonImageTypes = ['video/mp4', 'application/pdf', 'audio/mpeg', 'text/plain']
    nonImageTypes.forEach((type) => expect(isImage(type)).toBe(false))
  })
})

describe('matchesMimeTypePattern', () => {
  it('matches exact types', () => {
    expect(matchesMimeTypePattern('video/mp4', 'video/mp4')).toBe(true)
    expect(matchesMimeTypePattern('image/jpeg', 'image/jpeg')).toBe(true)
  })

  it('does not match different types', () => {
    expect(matchesMimeTypePattern('video/mp4', 'video/webm')).toBe(false)
    expect(matchesMimeTypePattern('video/mp4', 'audio/mp4')).toBe(false)
  })

  it('matches wildcards', () => {
    expect(matchesMimeTypePattern('video/mp4', 'video/*')).toBe(true)
    expect(matchesMimeTypePattern('video/webm', 'video/*')).toBe(true)
    expect(matchesMimeTypePattern('audio/mpeg', 'audio/*')).toBe(true)
    expect(matchesMimeTypePattern('image/png', 'image/*')).toBe(true)
    expect(matchesMimeTypePattern('application/pdf', 'application/*')).toBe(true)
  })

  it('wildcards do not match different categories', () => {
    expect(matchesMimeTypePattern('audio/mp3', 'video/*')).toBe(false)
    expect(matchesMimeTypePattern('video/mp4', 'image/*')).toBe(false)
  })

  it('handles edge cases', () => {
    expect(matchesMimeTypePattern('video/mp4', '')).toBe(false)
    expect(matchesMimeTypePattern('image/svg+xml', 'image/*')).toBe(true)
    expect(matchesMimeTypePattern('application/vnd.ms-excel', 'application/*')).toBe(true)
  })
})

describe('intersectMimeTypes', () => {
  it('returns other array if one is undefined', () => {
    expect(intersectMimeTypes(undefined, ['video/mp4'])).toEqual(['video/mp4'])
    expect(intersectMimeTypes(['image/jpeg'], undefined)).toEqual(['image/jpeg'])
    expect(intersectMimeTypes(undefined, undefined)).toBeUndefined()
  })

  it('returns intersection with exact matches', () => {
    const result = intersectMimeTypes(['video/mp4', 'video/webm', 'audio/mpeg'], ['video/mp4', 'image/jpeg'])

    expect(result).toContain('video/mp4')
    expect(result).not.toContain('video/webm')
    expect(result).not.toContain('audio/mpeg')
    expect(result).not.toContain('image/jpeg')
  })

  it('handles wildcards in intersection', () => {
    const result1 = intersectMimeTypes(['video/*'], ['video/mp4', 'video/webm', 'audio/mpeg'])
    expect(result1).toContain('video/mp4')
    expect(result1).toContain('video/webm')
    expect(result1).not.toContain('audio/mpeg')

    const result2 = intersectMimeTypes(['video/mp4', 'audio/mpeg'], ['video/*'])
    expect(result2).toContain('video/mp4')
    expect(result2).not.toContain('audio/mpeg')

    const result3 = intersectMimeTypes(['video/*', 'image/jpeg'], ['video/mp4', 'image/*'])
    expect(result3).toContain('video/mp4')
    expect(result3).toContain('image/jpeg')
  })

  it('returns undefined when no intersection or empty arrays', () => {
    expect(intersectMimeTypes(['video/mp4'], ['audio/mpeg'])).toBeUndefined()
    expect(intersectMimeTypes([], ['video/mp4'])).toBeUndefined()
    expect(intersectMimeTypes(['video/mp4'], [])).toBeUndefined()
  })

  it('does not duplicate matching items', () => {
    expect(intersectMimeTypes(['video/mp4'], ['video/mp4'])).toEqual(['video/mp4'])
  })
})
