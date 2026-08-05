import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CollectionContext } from '@/shared/types/index.js'

const { applyUrlTransformMock, maybeGenerateSignedUrlMock } = vi.hoisted(() => ({
  applyUrlTransformMock: vi.fn(),
  maybeGenerateSignedUrlMock: vi.fn(),
}))

vi.mock('@/server/payload/tokenAuth.js', () => ({
  maybeGenerateSignedUrl: maybeGenerateSignedUrlMock,
}))

vi.mock('@/shared/urlTransform.js', () => ({
  applyUrlTransform: applyUrlTransformMock,
}))

const { getGenerateUrl: rawGetGenerateUrl } = await import('@/server/payload/storage/generateUrl.js')

const getGenerateUrl = rawGetGenerateUrl as unknown as (
  ctx: CollectionContext,
) => (args: { data: unknown; filename: string; prefix?: string }) => string

const streamConfig = {
  apiKey: 'stream-key',
  hostname: 'stream.b-cdn.net',
  libraryId: 12345,
  tokenSecurityKey: 'stream-token',
}

const storageConfig = {
  apiKey: 'storage-key',
  hostname: 'storage.b-cdn.net',
  region: 'de',
  tokenSecurityKey: 'storage-token',
  zoneName: 'my-zone',
}

const buildContext = (overrides: Partial<CollectionContext> = {}): CollectionContext =>
  ({
    collection: { slug: 'media' },
    ...overrides,
  }) as unknown as CollectionContext

const streamData = { bunnyData: { stream: { videoId: 'video-guid' } } }

beforeEach(() => {
  vi.clearAllMocks()
  maybeGenerateSignedUrlMock.mockImplementation((url: string) => `signed:${url}`)
  applyUrlTransformMock.mockImplementation(({ url }: { url: string }) => `transformed:${url}`)
})

describe('getGenerateUrl', () => {
  describe('stream branch', () => {
    it('builds the playlist URL and signs it with a videoId token path', () => {
      const generate = getGenerateUrl(buildContext({ streamConfig } as Partial<CollectionContext>))

      const result = generate({ data: streamData, filename: 'clip.mp4' })

      expect(applyUrlTransformMock).not.toHaveBeenCalled()
      expect(maybeGenerateSignedUrlMock).toHaveBeenCalledWith(
        'https://stream.b-cdn.net/video-guid/playlist.m3u8',
        {
          collection: { slug: 'media' },
          filename: 'clip.mp4',
          signedUrls: undefined,
          tokenSecurityKey: 'stream-token',
        },
        { tokenPath: '/video-guid/' },
      )
      expect(result).toBe('signed:https://stream.b-cdn.net/video-guid/playlist.m3u8')
    })

    it('applies urlTransform to the playlist URL before signing', () => {
      const urlTransform = { appendTimestamp: false, queryParams: {} }
      const generate = getGenerateUrl(buildContext({ streamConfig, urlTransform } as Partial<CollectionContext>))

      const result = generate({ data: streamData, filename: 'clip.mp4', prefix: 'vids' })

      expect(applyUrlTransformMock).toHaveBeenCalledWith({
        collection: { slug: 'media' },
        config: urlTransform,
        data: streamData,
        filename: 'clip.mp4',
        prefix: 'vids',
        url: 'https://stream.b-cdn.net/video-guid/playlist.m3u8',
      })
      expect(maybeGenerateSignedUrlMock.mock.calls[0][0]).toBe(
        'transformed:https://stream.b-cdn.net/video-guid/playlist.m3u8',
      )
      expect(result).toBe('signed:transformed:https://stream.b-cdn.net/video-guid/playlist.m3u8')
    })

    it('passes signedUrls config through to the signer', () => {
      const signedUrls = { expiresIn: 3600 }
      const generate = getGenerateUrl(buildContext({ signedUrls, streamConfig } as Partial<CollectionContext>))

      generate({ data: streamData, filename: 'clip.mp4' })

      expect(maybeGenerateSignedUrlMock.mock.calls[0][1]).toMatchObject({ signedUrls })
    })
  })

  describe('storage branch', () => {
    it('builds an encoded storage URL and signs it (no token path)', () => {
      const generate = getGenerateUrl(buildContext({ storageConfig } as Partial<CollectionContext>))

      const result = generate({ data: {}, filename: 'my photo.jpg', prefix: 'a b' })

      expect(applyUrlTransformMock).not.toHaveBeenCalled()
      expect(maybeGenerateSignedUrlMock).toHaveBeenCalledWith('https://storage.b-cdn.net/a%20b/my%20photo.jpg', {
        collection: { slug: 'media' },
        filename: 'my photo.jpg',
        signedUrls: undefined,
        tokenSecurityKey: 'storage-token',
      })
      expect(result).toBe('signed:https://storage.b-cdn.net/a%20b/my%20photo.jpg')
    })

    it('applies urlTransform to the storage URL before signing', () => {
      const urlTransform = { appendTimestamp: false, queryParams: {} }
      const generate = getGenerateUrl(buildContext({ storageConfig, urlTransform } as Partial<CollectionContext>))

      const result = generate({ data: {}, filename: 'photo.jpg' })

      expect(applyUrlTransformMock).toHaveBeenCalledWith({
        collection: { slug: 'media' },
        config: urlTransform,
        data: {},
        filename: 'photo.jpg',
        prefix: '',
        url: 'https://storage.b-cdn.net/photo.jpg',
      })
      expect(result).toBe('signed:transformed:https://storage.b-cdn.net/photo.jpg')
    })

    it('falls through to the storage branch when a videoId exists but no streamConfig is set', () => {
      const generate = getGenerateUrl(buildContext({ storageConfig } as Partial<CollectionContext>))

      const result = generate({ data: streamData, filename: 'clip.mp4' })

      expect(maybeGenerateSignedUrlMock.mock.calls[0][0]).toBe('https://storage.b-cdn.net/clip.mp4')
      expect(result).toBe('signed:https://storage.b-cdn.net/clip.mp4')
    })
  })

  describe('no configuration', () => {
    it('returns an empty string when there is no stream video and no storage config', () => {
      const generate = getGenerateUrl(buildContext())

      const result = generate({ data: {}, filename: 'photo.jpg' })

      expect(result).toBe('')
      expect(maybeGenerateSignedUrlMock).not.toHaveBeenCalled()
    })

    it('returns an empty string when a stream is configured but the doc has no videoId', () => {
      const generate = getGenerateUrl(buildContext({ streamConfig } as Partial<CollectionContext>))

      const result = generate({ data: {}, filename: 'clip.mp4' })

      expect(result).toBe('')
      expect(maybeGenerateSignedUrlMock).not.toHaveBeenCalled()
    })
  })
})
