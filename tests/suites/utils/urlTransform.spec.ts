import type { CollectionConfig } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NormalizedUrlTransformConfig } from '@/types/configNormalized.js'
import { applyUrlTransform } from '@/utils/urlTransform.js'

const createMockCollection = (): CollectionConfig => ({
  slug: 'media',
  fields: [],
})

describe('applyUrlTransform', () => {
  const baseParams = {
    collection: createMockCollection(),
    filename: 'test-file.jpg',
    url: 'https://cdn.example.com/media/test-file.jpg',
  }

  describe('disabled config', () => {
    it('returns original URL when config is false', () => {
      const result = applyUrlTransform({
        ...baseParams,
        config: false,
      })

      expect(result).toBe(baseParams.url)
    })
  })

  describe('transformUrl function', () => {
    it('calls transformUrl function when provided', () => {
      const transformUrl = vi.fn().mockReturnValue('https://transformed.example.com/file.jpg')

      const config: NormalizedUrlTransformConfig = {
        appendTimestamp: false,
        queryParams: {},
        transformUrl,
      }

      const result = applyUrlTransform({
        ...baseParams,
        config,
        prefix: 'media',
      })

      expect(transformUrl).toHaveBeenCalledWith({
        baseUrl: baseParams.url,
        collection: baseParams.collection,
        data: undefined,
        filename: baseParams.filename,
        prefix: 'media',
      })
      expect(result).toBe('https://transformed.example.com/file.jpg')
    })

    it('passes data to transformUrl when provided', () => {
      const transformUrl = vi.fn().mockReturnValue('https://example.com/file.jpg')
      const data = { customField: 'value' }

      const config: NormalizedUrlTransformConfig = {
        appendTimestamp: false,
        queryParams: {},
        transformUrl,
      }

      applyUrlTransform({
        ...baseParams,
        config,
        data,
      })

      expect(transformUrl).toHaveBeenCalledWith(expect.objectContaining({ data }))
    })
  })

  describe('appendTimestamp', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
    })

    it('appends timestamp when appendTimestamp: true', () => {
      const config: NormalizedUrlTransformConfig = {
        appendTimestamp: true,
        queryParams: {},
      }

      const result = applyUrlTransform({
        ...baseParams,
        config,
      })

      expect(result).toContain('t=')
      expect(result).toMatch(/t=\d+/)
    })

    it('does not duplicate timestamp if already present', () => {
      const config: NormalizedUrlTransformConfig = {
        appendTimestamp: true,
        queryParams: {},
      }

      const result = applyUrlTransform({
        ...baseParams,
        config,
        url: 'https://cdn.example.com/file.jpg?t=existing',
      })

      expect(result).toContain('t=existing')
      const tMatches = result.match(/t=/g)
      expect(tMatches?.length).toBe(1)
    })

    it('does not append timestamp when appendTimestamp: false', () => {
      const config: NormalizedUrlTransformConfig = {
        appendTimestamp: false,
        queryParams: {},
      }

      const result = applyUrlTransform({
        ...baseParams,
        config,
      })

      expect(result).not.toContain('t=')
    })
  })

  describe('queryParams', () => {
    it('adds queryParams to URL', () => {
      const config: NormalizedUrlTransformConfig = {
        appendTimestamp: false,
        queryParams: {
          height: '200',
          quality: '80',
          width: '100',
        },
      }

      const result = applyUrlTransform({
        ...baseParams,
        config,
      })

      expect(result).toContain('width=100')
      expect(result).toContain('height=200')
      expect(result).toContain('quality=80')
    })

    it('does not override existing query params', () => {
      const config: NormalizedUrlTransformConfig = {
        appendTimestamp: false,
        queryParams: {
          newParam: 'value',
          width: '100',
        },
      }

      const result = applyUrlTransform({
        ...baseParams,
        config,
        url: 'https://cdn.example.com/file.jpg?width=200',
      })

      expect(result).toContain('width=200')
      expect(result).toContain('newParam=value')
      expect(result).not.toContain('width=100')
    })

    it('handles empty queryParams', () => {
      const config: NormalizedUrlTransformConfig = {
        appendTimestamp: false,
        queryParams: {},
      }

      const result = applyUrlTransform({
        ...baseParams,
        config,
      })

      expect(result).toBe(baseParams.url)
    })
  })

  describe('URL types', () => {
    it('handles relative URLs', () => {
      const config: NormalizedUrlTransformConfig = {
        appendTimestamp: false,
        queryParams: { param: 'value' },
      }

      const result = applyUrlTransform({
        ...baseParams,
        config,
        url: '/media/test-file.jpg',
      })

      expect(result).toBe('/media/test-file.jpg?param=value')
    })

    it('handles absolute URLs', () => {
      const config: NormalizedUrlTransformConfig = {
        appendTimestamp: false,
        queryParams: { param: 'value' },
      }

      const result = applyUrlTransform({
        ...baseParams,
        config,
        url: 'https://cdn.example.com/media/test-file.jpg',
      })

      expect(result).toBe('https://cdn.example.com/media/test-file.jpg?param=value')
    })

    it('handles URLs with existing query string', () => {
      const config: NormalizedUrlTransformConfig = {
        appendTimestamp: false,
        queryParams: { newParam: 'new' },
      }

      const result = applyUrlTransform({
        ...baseParams,
        config,
        url: 'https://cdn.example.com/file.jpg?existing=value',
      })

      expect(result).toContain('existing=value')
      expect(result).toContain('newParam=new')
    })

    it('handles URLs with port numbers', () => {
      const config: NormalizedUrlTransformConfig = {
        appendTimestamp: false,
        queryParams: { param: 'value' },
      }

      const result = applyUrlTransform({
        ...baseParams,
        config,
        url: 'https://cdn.example.com:8080/file.jpg',
      })

      expect(result).toContain('cdn.example.com:8080')
      expect(result).toContain('param=value')
    })
  })

  describe('combined options', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
    })

    it('handles both timestamp and queryParams', () => {
      const config: NormalizedUrlTransformConfig = {
        appendTimestamp: true,
        queryParams: {
          format: 'webp',
          quality: '80',
        },
      }

      const result = applyUrlTransform({
        ...baseParams,
        config,
      })

      expect(result).toContain('t=')
      expect(result).toContain('format=webp')
      expect(result).toContain('quality=80')
    })
  })

  describe('output format', () => {
    it('returns clean URL without query string when no params added', () => {
      const config: NormalizedUrlTransformConfig = {
        appendTimestamp: false,
        queryParams: {},
      }

      const result = applyUrlTransform({
        ...baseParams,
        config,
        url: 'https://cdn.example.com/file.jpg',
      })

      expect(result).toBe('https://cdn.example.com/file.jpg')
      expect(result).not.toContain('?')
    })

    it('preserves pathname correctly', () => {
      const config: NormalizedUrlTransformConfig = {
        appendTimestamp: false,
        queryParams: { param: 'value' },
      }

      const result = applyUrlTransform({
        ...baseParams,
        config,
        url: 'https://cdn.example.com/path/to/deep/file.jpg',
      })

      expect(result).toContain('/path/to/deep/file.jpg')
    })
  })
})
