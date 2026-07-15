import type { CollectionConfig } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { maybeCreateRedirect, maybeGenerateSignedUrl } from '@/cdn/tokenAuth.js'
import type { NormalizedSignedUrlsConfig } from '@/types/index.js'

const collection = { slug: 'media' } as unknown as CollectionConfig

const baseUrl = 'https://cdn.example.com/path/to/photo.jpg'

const signed = (over: Partial<NormalizedSignedUrlsConfig> = {}): NormalizedSignedUrlsConfig =>
  ({ expiresIn: 3600, ...over }) as NormalizedSignedUrlsConfig

const redirectContext = (
  over: Partial<Parameters<typeof maybeCreateRedirect>[1]> = {},
): Parameters<typeof maybeCreateRedirect>[1] => ({
  collection,
  filename: 'photo.jpg',
  signedUrls: signed({ staticHandler: { redirectStatus: 302, useRedirect: true } }),
  tokenSecurityKey: 'security-key',
  usePayloadAccessControl: true,
  ...over,
})

describe('maybeCreateRedirect', () => {
  describe('guard branches returning null', () => {
    it('returns null when access control is disabled', () => {
      expect(maybeCreateRedirect(baseUrl, redirectContext({ usePayloadAccessControl: false }))).toBeNull()
    })

    it('returns null when signedUrls is false', () => {
      expect(maybeCreateRedirect(baseUrl, redirectContext({ signedUrls: false }))).toBeNull()
    })

    it('returns null when signedUrls is undefined', () => {
      expect(maybeCreateRedirect(baseUrl, redirectContext({ signedUrls: undefined }))).toBeNull()
    })

    it('returns null when tokenSecurityKey is missing', () => {
      expect(maybeCreateRedirect(baseUrl, redirectContext({ tokenSecurityKey: undefined }))).toBeNull()
    })

    it('returns null when staticHandler is not configured', () => {
      expect(maybeCreateRedirect(baseUrl, redirectContext({ signedUrls: signed() }))).toBeNull()
    })

    it('returns null when useRedirect is false', () => {
      expect(
        maybeCreateRedirect(
          baseUrl,
          redirectContext({ signedUrls: signed({ staticHandler: { redirectStatus: 302, useRedirect: false } }) }),
        ),
      ).toBeNull()
    })

    it('returns null when shouldUseSignedUrl returns false', () => {
      const shouldUseSignedUrl = vi.fn().mockReturnValue(false)
      expect(
        maybeCreateRedirect(
          baseUrl,
          redirectContext({
            signedUrls: signed({ shouldUseSignedUrl, staticHandler: { redirectStatus: 302, useRedirect: true } }),
          }),
        ),
      ).toBeNull()
      expect(shouldUseSignedUrl).toHaveBeenCalledWith({ collection, filename: 'photo.jpg' })
    })
  })

  describe('success response', () => {
    it('returns a redirect with the signed Location, redirectStatus and no-store Cache-Control', () => {
      const res = maybeCreateRedirect(
        baseUrl,
        redirectContext({ signedUrls: signed({ staticHandler: { redirectStatus: 307, useRedirect: true } }) }),
      )

      expect(res).toBeInstanceOf(Response)
      expect(res!.status).toBe(307)
      expect(res!.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')

      const location = res!.headers.get('Location')!
      expect(location).not.toBeNull()
      const url = new URL(location)
      expect(url.origin + url.pathname).toBe('https://cdn.example.com/path/to/photo.jpg')
      expect(url.searchParams.get('token')).toBeTruthy()
      expect(url.searchParams.get('expires')).toBeTruthy()
    })

    it('honours redirectStatus 302', () => {
      const res = maybeCreateRedirect(baseUrl, redirectContext())
      expect(res!.status).toBe(302)
    })

    it('signs with a path-based token when tokenPath option is supplied', () => {
      const res = maybeCreateRedirect(
        'https://stream.example.com/vid1/play_720p.mp4',
        redirectContext({ filename: 'vid1/play_720p.mp4' }),
        { tokenPath: '/vid1/' },
      )

      const location = res!.headers.get('Location')!
      expect(location).toContain('/bcdn_token=')
      expect(location).toContain('/vid1/play_720p.mp4')
    })

    it('uses staticHandler.expiresIn to override the base expiresIn', () => {
      const before = Math.floor(Date.now() / 1000)
      const res = maybeCreateRedirect(
        baseUrl,
        redirectContext({
          signedUrls: signed({
            expiresIn: 9999,
            staticHandler: { expiresIn: 100, redirectStatus: 302, useRedirect: true },
          }),
        }),
      )
      const after = Math.floor(Date.now() / 1000)

      const expires = Number(new URL(res!.headers.get('Location')!).searchParams.get('expires'))
      expect(expires).toBeGreaterThanOrEqual(before + 100)
      expect(expires).toBeLessThanOrEqual(after + 100 + 1)
    })

    it('falls back to signedUrls.expiresIn when staticHandler.expiresIn is absent', () => {
      const before = Math.floor(Date.now() / 1000)
      const res = maybeCreateRedirect(
        baseUrl,
        redirectContext({
          signedUrls: signed({ expiresIn: 500, staticHandler: { redirectStatus: 302, useRedirect: true } }),
        }),
      )
      const after = Math.floor(Date.now() / 1000)

      const expires = Number(new URL(res!.headers.get('Location')!).searchParams.get('expires'))
      expect(expires).toBeGreaterThanOrEqual(before + 500)
      expect(expires).toBeLessThanOrEqual(after + 500 + 1)
    })
  })
})

describe('maybeGenerateSignedUrl', () => {
  const context = {
    collection,
    filename: 'photo.jpg',
    signedUrls: signed(),
    tokenSecurityKey: 'security-key',
  }

  it('returns the base URL unchanged when signedUrls is false', () => {
    expect(maybeGenerateSignedUrl(baseUrl, { ...context, signedUrls: false })).toBe(baseUrl)
  })

  it('returns the base URL unchanged when tokenSecurityKey is missing', () => {
    expect(maybeGenerateSignedUrl(baseUrl, { ...context, tokenSecurityKey: undefined })).toBe(baseUrl)
  })

  it('returns the base URL unchanged when shouldUseSignedUrl returns false', () => {
    const shouldUseSignedUrl = vi.fn().mockReturnValue(false)
    expect(maybeGenerateSignedUrl(baseUrl, { ...context, signedUrls: signed({ shouldUseSignedUrl }) })).toBe(baseUrl)
    expect(shouldUseSignedUrl).toHaveBeenCalledWith({ collection, filename: 'photo.jpg' })
  })

  it('signs the URL when no shouldUseSignedUrl gate is present', () => {
    const result = maybeGenerateSignedUrl(baseUrl, context)
    expect(result).not.toBe(baseUrl)
    expect(result).toContain('token=')
    expect(result).toContain('expires=')
  })
})
