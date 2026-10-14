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

import { buildContext, storageOptions, streamOptions } from '../../../../helpers/unit/context.js'

const { getGenerateUrl: rawGetGenerateUrl } = await import('@/server/payload/storage/generateUrl.js')

const getGenerateUrl = rawGetGenerateUrl as unknown as (
  ctx: CollectionContext,
) => (args: { data: unknown; filename: string; prefix?: string }) => string

const streamData = { bunnyData: { stream: { videoId: 'video-guid' } } }

beforeEach(() => {
  vi.clearAllMocks()
  maybeGenerateSignedUrlMock.mockImplementation((url: string) => `signed:${url}`)
  applyUrlTransformMock.mockImplementation(({ url }: { url: string }) => `transformed:${url}`)
})

describe('getGenerateUrl', () => {
  describe('stream branch', () => {
    it('builds the playlist URL and signs it with a videoId token path', () => {
      const signedUrls = { expiresIn: () => 3600 }
      const generate = getGenerateUrl(buildContext({ signedUrls, streamOptions } as Partial<CollectionContext>))

      const result = generate({ data: streamData, filename: 'clip.mp4' })

      expect(applyUrlTransformMock).not.toHaveBeenCalled()
      expect(maybeGenerateSignedUrlMock).toHaveBeenCalledWith(
        'https://stream.b-cdn.net/video-guid/playlist.m3u8',
        expect.objectContaining({
          collection: { slug: 'media' },
          filename: 'clip.mp4',
          signedUrls,
          tokenSecurityKey: 'stream-token',
        }),
        { tokenPath: '/video-guid/' },
      )
      expect(result).toBe('signed:https://stream.b-cdn.net/video-guid/playlist.m3u8')
    })

    it('applies urlTransform to the playlist URL before signing', () => {
      const urlTransform = { appendTimestamp: false, queryParams: {} }
      const generate = getGenerateUrl(buildContext({ streamOptions, urlTransform } as Partial<CollectionContext>))

      const result = generate({ data: streamData, filename: 'clip.mp4', prefix: 'vids' })

      expect(applyUrlTransformMock).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: { slug: 'media' },
          options: urlTransform,
          prefix: 'vids',
          url: 'https://stream.b-cdn.net/video-guid/playlist.m3u8',
        }),
      )
      expect(maybeGenerateSignedUrlMock.mock.calls[0][0]).toBe(
        'transformed:https://stream.b-cdn.net/video-guid/playlist.m3u8',
      )
      expect(result).toBe('signed:transformed:https://stream.b-cdn.net/video-guid/playlist.m3u8')
    })

    it.each(['video/mp4', 'audio/mpeg', 'application/mxf', ''])(
      'keeps the playlist URL for a "%s" file',
      (mimeType) => {
        const generate = getGenerateUrl(
          buildContext({
            storageOptions,
            streamOptions: { ...streamOptions, mimeTypes: ['video/webm', 'application/mxf'] },
          } as Partial<CollectionContext>),
        )

        expect(generate({ data: { ...streamData, mimeType }, filename: 'clip' })).toBe(
          'signed:https://stream.b-cdn.net/video-guid/playlist.m3u8',
        )
      },
    )

    it.each([
      ['image/jpeg', 'photo.jpg'],
      ['application/pdf', 'doc.pdf'],
    ])('uses the storage URL when a stale videoId remains on a %s file', (mimeType, filename) => {
      const generate = getGenerateUrl(buildContext({ storageOptions, streamOptions } as Partial<CollectionContext>))

      expect(generate({ data: { ...streamData, mimeType }, filename })).toBe(
        `signed:https://storage.b-cdn.net/${filename}`,
      )
    })
  })

  describe('storage branch', () => {
    it('builds an encoded storage URL and signs it without a token path', () => {
      const generate = getGenerateUrl(buildContext({ storageOptions } as Partial<CollectionContext>))

      const result = generate({ data: {}, filename: 'my photo.jpg', prefix: 'a b' })

      expect(applyUrlTransformMock).not.toHaveBeenCalled()
      expect(maybeGenerateSignedUrlMock).toHaveBeenCalledWith(
        'https://storage.b-cdn.net/a%20b/my%20photo.jpg',
        expect.objectContaining({
          collection: { slug: 'media' },
          filename: 'my photo.jpg',
          tokenSecurityKey: 'storage-token',
        }),
      )
      expect(result).toBe('signed:https://storage.b-cdn.net/a%20b/my%20photo.jpg')
    })

    it('applies urlTransform to the storage URL before signing', () => {
      const urlTransform = { appendTimestamp: false, queryParams: {} }
      const generate = getGenerateUrl(buildContext({ storageOptions, urlTransform } as Partial<CollectionContext>))

      const result = generate({ data: {}, filename: 'photo.jpg' })

      expect(applyUrlTransformMock).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: { slug: 'media' },
          options: urlTransform,
          prefix: '',
          url: 'https://storage.b-cdn.net/photo.jpg',
        }),
      )
      expect(result).toBe('signed:transformed:https://storage.b-cdn.net/photo.jpg')
    })

    it('resolves an empty document prefix under the collection prefix', () => {
      const generate = getGenerateUrl(buildContext({ prefix: 'media', storageOptions } as Partial<CollectionContext>))

      expect(generate({ data: {}, filename: 'photo.jpg', prefix: '' })).toBe(
        'signed:https://storage.b-cdn.net/media/photo.jpg',
      )
      expect(generate({ data: {}, filename: 'photo.jpg' })).toBe('signed:https://storage.b-cdn.net/media/photo.jpg')
    })

    it('falls back to the storage branch when a videoId exists but no streamOptions is set', () => {
      const generate = getGenerateUrl(buildContext({ storageOptions } as Partial<CollectionContext>))

      const result = generate({ data: streamData, filename: 'clip.mp4' })

      expect(maybeGenerateSignedUrlMock.mock.calls[0][0]).toBe('https://storage.b-cdn.net/clip.mp4')
      expect(result).toBe('signed:https://storage.b-cdn.net/clip.mp4')
    })
  })

  describe('no options', () => {
    it.each([
      ['there is no Stream video and no storage options', {}],
      ['a stream is configured but the doc has no videoId', { streamOptions }],
    ])('returns an empty string when %s', (_label, overrides) => {
      const generate = getGenerateUrl(buildContext(overrides as Partial<CollectionContext>))

      expect(generate({ data: {}, filename: 'photo.jpg' })).toBe('')
      expect(maybeGenerateSignedUrlMock).not.toHaveBeenCalled()
    })
  })
})
