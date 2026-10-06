import type { CollectionConfig, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { createNormalizedOptions } from '@/server/payload/options/normalizer.js'
import { generateSignedToken, maybeCreateRedirect, maybeGenerateSignedUrl } from '@/server/payload/tokenAuth.js'
import type { SignedUrlsOptions } from '@/shared/types/index.js'

import { signed } from '../../../helpers/unit/signedUrls.js'

const collection = { slug: 'media' } as unknown as CollectionConfig

const createReq = (): PayloadRequest =>
  ({
    headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }),
    payload: { logger: { warn: vi.fn() } },
  }) as unknown as PayloadRequest

const baseUrl = 'https://cdn.example.com/path/to/photo.jpg'

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
  signedUrls: signed({ redirect: { status: 302 } }),
  tokenSecurityKey: 'security-key',
  usePayloadAccessControl: true,
  ...over,
})

describe('maybeCreateRedirect', () => {
  describe('guards that return null', () => {
    it('returns null when access control is disabled', () => {
      expect(maybeCreateRedirect(baseUrl, redirectContext({ usePayloadAccessControl: false }))).toBeNull()
    })

    it('returns null when signedUrls is false or undefined', () => {
      expect(maybeCreateRedirect(baseUrl, redirectContext({ signedUrls: false }))).toBeNull()
      expect(maybeCreateRedirect(baseUrl, redirectContext({ signedUrls: undefined }))).toBeNull()
    })

    it('returns null when tokenSecurityKey is missing', () => {
      expect(maybeCreateRedirect(baseUrl, redirectContext({ tokenSecurityKey: undefined }))).toBeNull()
    })

    it('returns null when the redirect is not configured', () => {
      expect(maybeCreateRedirect(baseUrl, redirectContext({ signedUrls: signed() }))).toBeNull()
    })

    it('returns null when shouldUseSignedUrl returns false', () => {
      const shouldUseSignedUrl = vi.fn().mockReturnValue(false)
      expect(
        maybeCreateRedirect(
          baseUrl,
          redirectContext({
            signedUrls: signed({ redirect: { status: 302 }, shouldUseSignedUrl }),
          }),
        ),
      ).toBeNull()
      expect(shouldUseSignedUrl).toHaveBeenCalledWith({ collection, filename: 'photo.jpg' })
    })
  })

  describe('success response', () => {
    it('returns a redirect with the signed Location, status and no-store Cache-Control', () => {
      const res = maybeCreateRedirect(baseUrl, redirectContext({ signedUrls: signed({ redirect: { status: 307 } }) }))

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

    it('uses redirect.expiresIn to override the base expiresIn', () => {
      const before = Math.floor(Date.now() / 1000)
      const res = maybeCreateRedirect(
        baseUrl,
        redirectContext({
          signedUrls: signed({ expiresIn: () => 9999, redirect: { expiresIn: () => 100, status: 302 } }),
        }),
      )
      const after = Math.floor(Date.now() / 1000)

      const expires = Number(new URL(res!.headers.get('Location')!).searchParams.get('expires'))
      expect(expires).toBeGreaterThanOrEqual(before + 100)
      expect(expires).toBeLessThanOrEqual(after + 100 + 1)
    })

    it('falls back to signedUrls.expiresIn when redirect.expiresIn is absent', () => {
      const before = Math.floor(Date.now() / 1000)
      const res = maybeCreateRedirect(
        baseUrl,
        redirectContext({ signedUrls: signed({ expiresIn: () => 500, redirect: { status: 302 } }) }),
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

describe('signedUrls.expiresIn', () => {
  const signedFrom = (global: SignedUrlsOptions, collectionValue?: SignedUrlsOptions) => {
    const normalized = createNormalizedOptions({
      collections: { media: collectionValue ? { signedUrls: collectionValue } : true },
      signedUrls: global,
    })
    return normalized.collections.get('media')!.signedUrls!
  }

  const sign = (signedUrls: ReturnType<typeof signedFrom>, filename = 'photo.jpg'): number =>
    Number(
      new URL(
        maybeGenerateSignedUrl(baseUrl, { collection, filename, signedUrls, tokenSecurityKey: 'security-key' }),
      ).searchParams.get('expires'),
    )

  const now = (): number => Math.floor(Date.now() / 1000)

  it('treats a number as seconds from now', () => {
    const before = now()
    const expires = sign(signedFrom({ expiresIn: 600 }))
    expect(expires).toBeGreaterThanOrEqual(before + 600)
    expect(expires).toBeLessThanOrEqual(now() + 601)
  })

  it('defaults to 7200 seconds', () => {
    const before = now()
    expect(sign(signedFrom({}))).toBeGreaterThanOrEqual(before + 7200)
  })

  it('uses a Date returned by the function as the absolute expiry', () => {
    const expiresIn = vi.fn().mockReturnValue(new Date(1800000000 * 1000))

    expect(sign(signedFrom({ expiresIn }))).toBe(1800000000)
    expect(expiresIn).toHaveBeenCalledWith({ collection, defaultValue: 7200, filename: 'photo.jpg', req: undefined })
  })

  it('falls back to defaultValue when the function returns undefined', () => {
    const before = now()
    const expires = sign(
      signedFrom({
        expiresIn: ({ defaultValue, filename }) => (filename.startsWith('live/') ? defaultValue : undefined),
      }),
    )
    expect(expires).toBeGreaterThanOrEqual(before + 7200)
  })

  it('passes the global result as defaultValue at collection level', () => {
    const deadline = new Date(1800000000 * 1000)
    const signedUrls = signedFrom(
      { expiresIn: ({ filename }) => (filename.startsWith('live/') ? deadline : 600) },
      { expiresIn: ({ defaultValue }) => (defaultValue instanceof Date ? defaultValue : 300) },
    )

    expect(sign(signedUrls, 'live/a.mp4')).toBe(1800000000)
    const before = now()
    const expires = sign(signedUrls, 'other.jpg')
    expect(expires).toBeGreaterThanOrEqual(before + 300)
    expect(expires).toBeLessThanOrEqual(now() + 301)
  })

  it('keeps the global function when the collection only changes other fields', () => {
    const signedUrls = signedFrom({ expiresIn: () => new Date(1800000000 * 1000) }, { allowedCountries: ['DE'] })

    expect(sign(signedUrls)).toBe(1800000000)
  })

  it('throws when the function returns more than 10 years in seconds', () => {
    expect(() => sign(signedFrom({ expiresIn: () => 1800000000 }))).toThrow(
      '[@seshuk/payload-storage-bunny] signedUrls.expiresIn returned 1800000000 seconds',
    )
  })

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])('throws when the function returns %s', (value) => {
    expect(() => sign(signedFrom({ expiresIn: () => value }))).toThrow(
      `[@seshuk/payload-storage-bunny] signedUrls.expiresIn returned ${value} seconds`,
    )
  })

  it('throws when the function returns an invalid Date', () => {
    expect(() => sign(signedFrom({ expiresIn: () => new Date('nope') }))).toThrow(
      '[@seshuk/payload-storage-bunny] signedUrls.expiresIn returned an invalid Date',
    )
  })

  it('names redirect.expiresIn when the redirect function returns an invalid value', () => {
    const signedUrls = signedFrom({ staticHandler: { redirect: { expiresIn: () => 0 } } })

    expect(() => maybeCreateRedirect(baseUrl, redirectContext({ signedUrls }))).toThrow(
      '[@seshuk/payload-storage-bunny] signedUrls.staticHandler.redirect.expiresIn returned 0 seconds',
    )
  })

  it('passes signedUrls.expiresIn as defaultValue to redirect.expiresIn', () => {
    const redirectExpiresIn = vi.fn(({ defaultValue }: { defaultValue: Date | number }) =>
      typeof defaultValue === 'number' ? defaultValue / 2 : defaultValue,
    )
    const signedUrls = signedFrom({ expiresIn: 1000, staticHandler: { redirect: { expiresIn: redirectExpiresIn } } })
    const before = now()

    const res = maybeCreateRedirect(baseUrl, redirectContext({ signedUrls }))
    const expires = Number(new URL(res!.headers.get('Location')!).searchParams.get('expires'))

    expect(redirectExpiresIn).toHaveBeenCalledWith(expect.objectContaining({ defaultValue: 1000 }))
    expect(expires).toBeGreaterThanOrEqual(before + 500)
    expect(expires).toBeLessThanOrEqual(now() + 501)
    expect(res!.status).toBe(302)
  })

  it('uses the collection expiresIn for an inherited redirect without its own expiresIn', () => {
    const signedUrls = signedFrom({ staticHandler: { redirect: true } }, { expiresIn: 300 })
    const before = now()

    const res = maybeCreateRedirect(baseUrl, redirectContext({ signedUrls }))
    const expires = Number(new URL(res!.headers.get('Location')!).searchParams.get('expires'))

    expect(expires).toBeGreaterThanOrEqual(before + 300)
    expect(expires).toBeLessThanOrEqual(now() + 301)
  })
})

describe('maybeCreateRedirect with userIp and an absolute expiry', () => {
  it('locks the redirect Location token to the client IP', () => {
    const req = createReq()
    const userIp = vi.fn(({ req: callbackReq }) => callbackReq.headers.get('x-forwarded-for') ?? undefined)

    const res = maybeCreateRedirect(
      baseUrl,
      redirectContext({
        req,
        signedUrls: signed({ redirect: { status: 302 }, userIp }),
      }),
    )

    expect(userIp).toHaveBeenCalledWith({ collection, filename: 'photo.jpg', req })

    const location = new URL(res!.headers.get('Location')!)
    const expires = Number(location.searchParams.get('expires'))
    expect(location.searchParams.get('token')).toBe(
      generateSignedToken('security-key', '/path/to/photo.jpg', expires, undefined, '203.0.113.7'),
    )
  })

  it('uses an absolute Date from redirect.expiresIn', () => {
    const res = maybeCreateRedirect(
      baseUrl,
      redirectContext({
        req: createReq(),
        signedUrls: signed({ redirect: { expiresIn: () => new Date(1800000000 * 1000), status: 302 } }),
      }),
    )

    expect(new URL(res!.headers.get('Location')!).searchParams.get('expires')).toBe('1800000000')
  })
})
