import type { CollectionConfig } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  getAdminThumbnail,
  getThumbnailURLAfterReadFieldHook,
  getUrlAfterReadFieldHook,
} from '@/server/payload/fields/hooks.js'
import type {
  NormalizedSignedUrlsConfig,
  NormalizedStorageConfig,
  NormalizedStreamConfig,
  NormalizedThumbnailConfig,
  NormalizedUrlTransformConfig,
} from '@/shared/types/configNormalized.js'
import type { CollectionContext } from '@/shared/types/index.js'

const storageConfig = {
  apiKey: 'storage-key',
  hostname: 'storage.b-cdn.net',
  region: 'de',
  uploadTimeout: 30000,
  zoneName: 'my-zone',
} as NormalizedStorageConfig

const streamConfig = {
  apiKey: 'stream-key',
  hostname: 'stream.b-cdn.net',
  libraryId: 12345,
  mimeTypes: ['video/mp4'],
  mp4Fallback: false,
  uploadTimeout: 30000,
} as unknown as NormalizedStreamConfig

const thumbnail = (overrides: Partial<NormalizedThumbnailConfig> = {}): NormalizedThumbnailConfig => ({
  appendTimestamp: false,
  queryParams: {},
  streamAnimated: false,
  ...overrides,
})

const buildContext = (overrides: Partial<CollectionContext> = {}): CollectionContext =>
  ({
    collection: { slug: 'media' } as unknown as CollectionConfig,
    isTusUploadSupported: false,
    thumbnail: thumbnail(),
    usePayloadAccessControl: false,
    ...overrides,
  }) as unknown as CollectionContext

const imageDoc = { filename: 'pic.png', mimeType: 'image/png', prefix: 'up' }
const streamDoc = { bunnyData: { stream: { videoId: 'v-9' } }, filename: 'clip.mp4', mimeType: 'video/mp4' }

describe('field hooks', () => {
  describe('getAdminThumbnail', () => {
    it('returns undefined when no thumbnail is configured', () => {
      expect(getAdminThumbnail(buildContext({ thumbnail: undefined }))).toBeUndefined()
    })

    describe('image branch', () => {
      it('builds the storage CDN url when access control is off', () => {
        const fn = getAdminThumbnail(buildContext({ storageConfig }))!
        expect(fn({ doc: imageDoc, req: {} as never })).toBe('https://storage.b-cdn.net/up/pic.png')
      })

      it('applies the thumbnail urlTransform query params', () => {
        const fn = getAdminThumbnail(
          buildContext({ storageConfig, thumbnail: thumbnail({ queryParams: { v: '2' } }) }),
        )!
        expect(fn({ doc: imageDoc, req: {} as never })).toBe('https://storage.b-cdn.net/up/pic.png?v=2')
      })

      it('signs the url when signedUrls and a tokenSecurityKey are present', () => {
        const fn = getAdminThumbnail(
          buildContext({
            signedUrls: { expiresIn: 3600 } as NormalizedSignedUrlsConfig,
            storageConfig: { ...storageConfig, tokenSecurityKey: 'sec-key' },
          }),
        )!
        const url = fn({ doc: imageDoc, req: {} as never })!
        expect(url.startsWith('https://storage.b-cdn.net/up/pic.png?')).toBe(true)
        expect(url).toMatch(/[?&]token=/)
        expect(url).toMatch(/[?&]expires=/)
      })

      it('does not sign when signedUrls is set but no tokenSecurityKey exists', () => {
        const fn = getAdminThumbnail(
          buildContext({ signedUrls: { expiresIn: 3600 } as NormalizedSignedUrlsConfig, storageConfig }),
        )!
        expect(fn({ doc: imageDoc, req: {} as never })).toBe('https://storage.b-cdn.net/up/pic.png')
      })

      it('returns the internal api url when access control is on', () => {
        const fn = getAdminThumbnail(buildContext({ storageConfig, usePayloadAccessControl: true }))!
        expect(fn({ doc: imageDoc, req: {} as never })).toBe('/api/media/file/pic.png')
      })

      it('returns null when there is no storage config and access control is off', () => {
        const fn = getAdminThumbnail(buildContext({}))!
        expect(fn({ doc: imageDoc, req: {} as never })).toBeNull()
      })
    })

    describe('sizeName branch', () => {
      it('builds the storage CDN url for the requested size filename', () => {
        const fn = getAdminThumbnail(buildContext({ storageConfig, thumbnail: thumbnail({ sizeName: 'card' }) }))!
        const doc = {
          filename: 'orig.png',
          mimeType: 'image/png',
          prefix: '',
          sizes: { card: { filename: 'card.png' } },
        }
        expect(fn({ doc, req: {} as never })).toBe('https://storage.b-cdn.net/card.png')
      })
    })

    describe('stream branch', () => {
      it('builds the stream thumbnail url when access control is off', () => {
        const fn = getAdminThumbnail(buildContext({ streamConfig }))!
        expect(fn({ doc: streamDoc, req: {} as never })).toBe('https://stream.b-cdn.net/v-9/thumbnail.jpg')
      })

      it('uses the animated preview asset when streamAnimated is set', () => {
        const fn = getAdminThumbnail(buildContext({ streamConfig, thumbnail: thumbnail({ streamAnimated: true }) }))!
        expect(fn({ doc: streamDoc, req: {} as never })).toBe('https://stream.b-cdn.net/v-9/preview.webp')
      })

      it('returns the internal api url when access control is on', () => {
        const fn = getAdminThumbnail(buildContext({ streamConfig, usePayloadAccessControl: true }))!
        expect(fn({ doc: streamDoc, req: {} as never })).toBe('/api/media/file/bunny%3Astream%3Av-9%3Athumbnail.jpg')
      })
    })

    it('returns null for a non-image, non-stream document', () => {
      const fn = getAdminThumbnail(buildContext({ storageConfig }))!
      expect(fn({ doc: { filename: 'doc.pdf', mimeType: 'application/pdf' }, req: {} as never })).toBeNull()
    })
  })

  describe('getThumbnailURLAfterReadFieldHook', () => {
    it('returns null when there is no originalDoc', () => {
      const hook = getThumbnailURLAfterReadFieldHook({ context: buildContext({ storageConfig }) })
      expect(hook({ originalDoc: undefined, req: {} } as never)).toBeNull()
    })

    it('returns null when no thumbnail is configured', () => {
      const hook = getThumbnailURLAfterReadFieldHook({ context: buildContext({ storageConfig, thumbnail: undefined }) })
      expect(hook({ originalDoc: imageDoc, req: {} } as never)).toBeNull()
    })

    it('delegates to the admin thumbnail for a real doc', () => {
      const hook = getThumbnailURLAfterReadFieldHook({ context: buildContext({ storageConfig }) })
      expect(hook({ originalDoc: imageDoc, req: {} } as never)).toBe('https://storage.b-cdn.net/up/pic.png')
    })
  })

  describe('getUrlAfterReadFieldHook', () => {
    const urlTransform: NormalizedUrlTransformConfig = { appendTimestamp: false, queryParams: { v: '2' } }

    it('returns the value untouched when access control is off', () => {
      const hook = getUrlAfterReadFieldHook({ context: buildContext({ urlTransform }) })
      expect(hook({ data: imageDoc, value: 'https://cdn.example.com/up/pic.png' } as never)).toBe(
        'https://cdn.example.com/up/pic.png',
      )
    })

    it('applies the urlTransform when access control is on', () => {
      const hook = getUrlAfterReadFieldHook({ context: buildContext({ urlTransform, usePayloadAccessControl: true }) })
      expect(hook({ data: imageDoc, value: '/api/media/file/pic.png' } as never)).toBe('/api/media/file/pic.png?v=2')
    })

    it('returns the value untouched when there is no urlTransform', () => {
      const hook = getUrlAfterReadFieldHook({ context: buildContext({ usePayloadAccessControl: true }) })
      expect(hook({ data: imageDoc, value: '/api/media/file/pic.png' } as never)).toBe('/api/media/file/pic.png')
    })

    it('resolves the size filename for the transform callback', () => {
      const seen: string[] = []
      const transform: NormalizedUrlTransformConfig = {
        appendTimestamp: false,
        queryParams: {},
        transformUrl: ({ baseUrl, filename }) => {
          seen.push(filename)
          return baseUrl
        },
      }
      const hook = getUrlAfterReadFieldHook({
        context: buildContext({ urlTransform: transform, usePayloadAccessControl: true }),
        size: { name: 'card' },
      })
      const data = { filename: 'orig.png', sizes: { card: { filename: 'card.png' } } }
      hook({ data, value: '/api/media/file/card.png' } as never)
      expect(seen).toEqual(['card.png'])
    })

    it('re-signs the url with the request IP when userIp is configured and access control is off', () => {
      const req = {
        headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }),
        payload: { logger: { warn: () => undefined } },
      }
      const seen: Array<string | undefined> = []
      const hook = getUrlAfterReadFieldHook({
        context: buildContext({
          signedUrls: {
            expiresIn: 3600,
            userIp: ({ req: cbReq }) => {
              const ip = cbReq.headers.get('x-forwarded-for') ?? undefined
              seen.push(ip)
              return ip
            },
          } as NormalizedSignedUrlsConfig,
          storageConfig: { ...storageConfig, tokenSecurityKey: 'sec-key' },
        }),
      })

      const url = hook({ data: imageDoc, req, value: 'https://storage.b-cdn.net/up/pic.png?token=old' } as never)

      expect(seen).toEqual(['203.0.113.7'])
      expect(url).toMatch(/^https:\/\/storage\.b-cdn\.net\/up\/pic\.png\?token=/)
      expect(url).not.toContain('token=old')
      expect(url).not.toContain('203.0.113.7')
    })

    it('does not re-sign when userIp is configured but access control is on', () => {
      const hook = getUrlAfterReadFieldHook({
        context: buildContext({
          signedUrls: { expiresIn: 3600, userIp: () => '203.0.113.7' } as NormalizedSignedUrlsConfig,
          storageConfig: { ...storageConfig, tokenSecurityKey: 'sec-key' },
          usePayloadAccessControl: true,
        }),
      })

      expect(hook({ data: imageDoc, value: '/api/media/file/pic.png' } as never)).toBe('/api/media/file/pic.png')
    })
  })
})
