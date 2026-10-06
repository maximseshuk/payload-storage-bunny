import type { CollectionConfig } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { applyUrlTransform } from '@/shared/urlTransform.js'

const collection: CollectionConfig = { slug: 'media', fields: [] }
const baseParams = { collection, filename: 'test-file.jpg', url: 'https://cdn.example.com/media/test-file.jpg' }
const noop = { appendTimestamp: false, queryParams: {} }

afterEach(() => {
  vi.useRealTimers()
})

describe('applyUrlTransform', () => {
  it('returns the original URL when options are false', () => {
    expect(applyUrlTransform({ ...baseParams, options: false })).toBe(baseParams.url)
  })

  it('delegates to transformUrl with every input', () => {
    const transformUrl = vi.fn().mockReturnValue('https://transformed.example.com/file.jpg')
    const data = { customField: 'value' }

    const result = applyUrlTransform({ ...baseParams, options: { ...noop, transformUrl }, data, prefix: 'media' })

    expect(transformUrl).toHaveBeenCalledWith({
      baseUrl: baseParams.url,
      collection,
      data,
      filename: baseParams.filename,
      prefix: 'media',
    })
    expect(result).toBe('https://transformed.example.com/file.jpg')
  })

  it('appends the current timestamp and queryParams', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))

    const result = applyUrlTransform({
      ...baseParams,
      options: { appendTimestamp: true, queryParams: { format: 'webp', quality: '80' } },
    })

    expect(result).toBe('https://cdn.example.com/media/test-file.jpg?t=1705320000000&format=webp&quality=80')
  })

  it('keeps existing t and query params instead of overriding them', () => {
    const result = applyUrlTransform({
      ...baseParams,
      options: { appendTimestamp: true, queryParams: { newParam: 'value', width: '100' } },
      url: 'https://cdn.example.com/file.jpg?t=existing&width=200',
    })

    expect(result).toBe('https://cdn.example.com/file.jpg?t=existing&width=200&newParam=value')
  })

  it.each([
    ['https://cdn.example.com:8080/path/to/deep/file.jpg', {}, 'https://cdn.example.com:8080/path/to/deep/file.jpg'],
    ['https://cdn.example.com/file.jpg', { param: 'value' }, 'https://cdn.example.com/file.jpg?param=value'],
    ['/media/test-file.jpg', {}, '/media/test-file.jpg'],
    ['/media/test-file.jpg', { param: 'value' }, '/media/test-file.jpg?param=value'],
  ])('turns %s with queryParams %o into %s', (url, queryParams, expected) => {
    expect(applyUrlTransform({ ...baseParams, options: { ...noop, queryParams }, url })).toBe(expected)
  })
})
