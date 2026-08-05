import type { CollectionConfig, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { generateSignedToken, maybeCreateRedirect, maybeGenerateSignedUrl } from '@/server/payload/tokenAuth.js'
import type { NormalizedSignedUrlsConfig } from '@/shared/types/index.js'

const collection = { slug: 'media' } as unknown as CollectionConfig

const createReq = (): PayloadRequest =>
  ({
    headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }),
    payload: { logger: { warn: vi.fn() } },
  }) as unknown as PayloadRequest

const baseUrl = 'https://cdn.example.com/path/to/photo.jpg'

const signed = (over: Partial<NormalizedSignedUrlsConfig> = {}): NormalizedSignedUrlsConfig =>
  ({ expiresIn: 3600, ...over }) as NormalizedSignedUrlsConfig

const tokenLockedTo = (result: string, ip?: string): string => {
  const url = new URL(result)
  const expires = Number(url.searchParams.get('expires'))
  return generateSignedToken('security-key', '/path/to/photo.jpg', expires, undefined, ip)
}

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

  it('passes req to shouldUseSignedUrl when available', () => {
    const req = createReq()
    const shouldUseSignedUrl = vi.fn().mockReturnValue(true)

    maybeGenerateSignedUrl(baseUrl, { ...context, req, signedUrls: signed({ shouldUseSignedUrl }) })

    expect(shouldUseSignedUrl).toHaveBeenCalledWith({ collection, filename: 'photo.jpg', req })
  })
})

describe('maybeGenerateSignedUrl with userIp', () => {
  const context = {
    collection,
    filename: 'photo.jpg',
    signedUrls: signed(),
    tokenSecurityKey: 'security-key',
  }

  it('locks the token to the IP returned by the callback', () => {
    const req = createReq()
    const userIp = vi.fn(({ req: callbackReq }) => callbackReq.headers.get('x-forwarded-for') ?? undefined)

    const result = maybeGenerateSignedUrl(baseUrl, { ...context, req, signedUrls: signed({ userIp }) })

    expect(userIp).toHaveBeenCalledWith({ collection, filename: 'photo.jpg', req })
    expect(new URL(result).searchParams.get('token')).toBe(tokenLockedTo(result, '203.0.113.7'))
    expect(result).not.toContain('203.0.113.7')
  })

  it('signs without an IP lock when the callback returns undefined', () => {
    const req = createReq()
    const userIp = vi.fn().mockReturnValue(undefined)

    const result = maybeGenerateSignedUrl(baseUrl, { ...context, req, signedUrls: signed({ userIp }) })

    expect(userIp).toHaveBeenCalledOnce()
    expect(new URL(result).searchParams.get('token')).toBe(tokenLockedTo(result))
  })

  it('does not invoke the callback when no req is available', () => {
    const userIp = vi.fn().mockReturnValue('203.0.113.7')

    const result = maybeGenerateSignedUrl(baseUrl, { ...context, signedUrls: signed({ userIp }) })

    expect(userIp).not.toHaveBeenCalled()
    expect(new URL(result).searchParams.get('token')).toBe(tokenLockedTo(result))
  })

  it('rejects a non-IPv4 value, warns, and signs without an IP lock', () => {
    const req = createReq()
    const userIp = vi.fn().mockReturnValue('2001:db8::1')

    const result = maybeGenerateSignedUrl(baseUrl, { ...context, req, signedUrls: signed({ userIp }) })

    expect(req.payload.logger.warn).toHaveBeenCalledOnce()
    expect(new URL(result).searchParams.get('token')).toBe(tokenLockedTo(result))
  })

  it('rejects an IPv4 with out-of-range octets', () => {
    const req = createReq()
    const userIp = vi.fn().mockReturnValue('300.1.1.1')

    const result = maybeGenerateSignedUrl(baseUrl, { ...context, req, signedUrls: signed({ userIp }) })

    expect(req.payload.logger.warn).toHaveBeenCalledOnce()
    expect(new URL(result).searchParams.get('token')).toBe(tokenLockedTo(result))
  })

  it('trims surrounding whitespace from the returned IP', () => {
    const req = createReq()
    const userIp = vi.fn().mockReturnValue(' 203.0.113.7 ')

    const result = maybeGenerateSignedUrl(baseUrl, { ...context, req, signedUrls: signed({ userIp }) })

    expect(new URL(result).searchParams.get('token')).toBe(tokenLockedTo(result, '203.0.113.7'))
  })
})

describe('maybeGenerateSignedUrl with expiresAt', () => {
  const context = {
    collection,
    filename: 'photo.jpg',
    signedUrls: signed(),
    tokenSecurityKey: 'security-key',
  }

  it('uses the absolute expiry returned by the callback', () => {
    const expiresAt = vi.fn().mockReturnValue(1800000000)

    const result = maybeGenerateSignedUrl(baseUrl, { ...context, signedUrls: signed({ expiresAt }) })

    expect(expiresAt).toHaveBeenCalledWith({ collection, filename: 'photo.jpg', req: undefined })
    expect(new URL(result).searchParams.get('expires')).toBe('1800000000')
  })

  it('converts a Date to a UNIX timestamp in seconds', () => {
    const expiresAt = vi.fn().mockReturnValue(new Date(1800000000 * 1000))

    const result = maybeGenerateSignedUrl(baseUrl, { ...context, signedUrls: signed({ expiresAt }) })

    expect(new URL(result).searchParams.get('expires')).toBe('1800000000')
  })

  it('falls back to expiresIn when the callback returns undefined', () => {
    const before = Math.floor(Date.now() / 1000)
    const result = maybeGenerateSignedUrl(baseUrl, {
      ...context,
      signedUrls: signed({ expiresAt: () => undefined, expiresIn: 3600 }),
    })
    const after = Math.floor(Date.now() / 1000)

    const expires = Number(new URL(result).searchParams.get('expires'))
    expect(expires).toBeGreaterThanOrEqual(before + 3600)
    expect(expires).toBeLessThanOrEqual(after + 3600 + 1)
  })
})

describe('maybeCreateRedirect with userIp and expiresAt', () => {
  it('locks the redirect Location token to the client IP', () => {
    const req = createReq()
    const userIp = vi.fn(({ req: callbackReq }) => callbackReq.headers.get('x-forwarded-for') ?? undefined)

    const res = maybeCreateRedirect(
      baseUrl,
      redirectContext({
        req,
        signedUrls: signed({ staticHandler: { redirectStatus: 302, useRedirect: true }, userIp }),
      }),
    )

    expect(userIp).toHaveBeenCalledWith({ collection, filename: 'photo.jpg', req })

    const location = new URL(res!.headers.get('Location')!)
    const expires = Number(location.searchParams.get('expires'))
    expect(location.searchParams.get('token')).toBe(
      generateSignedToken('security-key', '/path/to/photo.jpg', expires, undefined, '203.0.113.7'),
    )
  })

  it('uses the absolute expiry from expiresAt over staticHandler.expiresIn', () => {
    const res = maybeCreateRedirect(
      baseUrl,
      redirectContext({
        req: createReq(),
        signedUrls: signed({
          expiresAt: () => 1800000000,
          staticHandler: { expiresIn: 100, redirectStatus: 302, useRedirect: true },
        }),
      }),
    )

    expect(new URL(res!.headers.get('Location')!).searchParams.get('expires')).toBe('1800000000')
  })
})
