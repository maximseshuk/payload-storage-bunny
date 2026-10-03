import { createHash, createHmac } from 'crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  generateStreamTusUploadSignature,
  signStreamVideoToken,
  verifyStreamVideoToken,
} from '@/server/payload/stream/tusSignature.js'
import { generateSignedToken, generateSignedUrl } from '@/server/payload/tokenAuth.js'

const rawToken = (hashable: string) =>
  createHash('sha256').update(hashable).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

describe('pinned token output of the Bunny standard scheme', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pins the token for key, path and expires', () => {
    expect(generateSignedToken('test-security-key', '/path/to/file.jpg', 1700000000)).toBe(
      'SxFvxHGdfK9v7p53gmnSvd84VLGy2GlsIrPBoCPGqns',
    )
  })

  it('pins the token for key, path, expires and sorted params', () => {
    expect(
      generateSignedToken('test-security-key', '/path/to/file.jpg', 1700000000, 'token_countries=US,CA&width=500'),
    ).toBe('d8_U6ufdeoXh1KgeBCjJHu3Di1Tlh_uMPWAbCfi9Ahg')
  })

  it('pins the token for token_path signing', () => {
    expect(generateSignedToken('test-security-key', '/videos/', 1700000000, 'token_path=/videos/')).toBe(
      'LK4PNazpPWHPtkD4ShDMsm7fGD8Bvg0HV5monXaghkg',
    )
  })

  it('pins the full query mode URL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1699996400000))

    const url = generateSignedUrl('https://cdn.example.com/file.jpg', 'test-security-key', {
      allowedCountries: ['US', 'CA'],
      expiresIn: 3600,
    })

    expect(url).toBe(
      'https://cdn.example.com/file.jpg?token_countries=US%2CCA&token=CUyXC1WG2Rd2Dirr-Ftkm8iG79k5psJf7GVYm4hfayI&expires=1700000000',
    )
  })

  it('pins the full path mode URL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1699996400000))

    const url = generateSignedUrl(
      'https://stream.example.com/vid123/playlist.m3u8',
      'test-security-key',
      {
        expiresIn: 3600,
      },
      {
        tokenPath: '/vid123/',
      },
    )

    expect(url).toBe(
      'https://stream.example.com/bcdn_token=FxF2m08_mzkcT5O12FB_R23oWkIUDkr6EpPGB2E7Qnc&token_path=%2Fvid123%2F&expires=1700000000/vid123/playlist.m3u8',
    )
  })

  it('pins the plain URL without extra params', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1699996400000))

    const url = generateSignedUrl('https://cdn.example.com/file.jpg', 'test-security-key', { expiresIn: 3600 })

    expect(url).toBe(
      'https://cdn.example.com/file.jpg?token=-UDRI8YaL5AmYgvcAaAfm2dJqCOTm0bcqtXm3mCUjMA&expires=1700000000',
    )
  })
})

describe('IP-locked tokens', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const securityKey = 'test-security-key'
  const signaturePath = '/path/to/file.jpg'
  const expires = '1700000000'
  const userIp = '192.168.1.1'
  const sortedParams = 'token_countries=US,CA&width=500'

  it('appends the IP after expires when there are no params', () => {
    const token = generateSignedToken(securityKey, signaturePath, 1700000000, undefined, userIp)

    expect(token).toBe(rawToken(securityKey + signaturePath + expires + userIp))
    expect(token).toBe('28C0lC5Wc2I6oClnXZMYt5cVIjN_lT8WVIGIi5Uo9sk')
  })

  it('appends the IP after sorted params when both are present', () => {
    const token = generateSignedToken(securityKey, signaturePath, 1700000000, sortedParams, userIp)

    expect(token).toBe(rawToken(securityKey + signaturePath + expires + sortedParams + userIp))
    expect(token).toBe('9Z9BAQyKZQE9ySUELn1hNKJ4nw9l3XtZ8DdUFRwDJVI')
  })

  it('signs URLs with the IP in the hash but never in the URL itself', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1699996400000))

    const url = generateSignedUrl(
      'https://cdn.example.com/file.jpg',
      'test-security-key',
      { expiresIn: 3600 },
      { userIp: '192.168.1.1' },
    )

    expect(url).toBe(
      'https://cdn.example.com/file.jpg?token=2g2Y3w3fl6xutlMR8qcLF2bYoPQhMT38oVvlvPB_e_Q&expires=1700000000',
    )
    expect(url).not.toContain('192.168.1.1')
  })

  it('combines IP with country restrictions in the pinned order', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1699996400000))

    const url = generateSignedUrl(
      'https://cdn.example.com/file.jpg',
      'test-security-key',
      { allowedCountries: ['US', 'CA'], expiresIn: 3600 },
      { userIp: '192.168.1.1' },
    )

    expect(url).toBe(
      'https://cdn.example.com/file.jpg?token_countries=US%2CCA&token=KS9zPyHTop6XXm3ErGpzXFsHbh-2o_GyIADc9KebL8c&expires=1700000000',
    )
  })

  it('combines IP with a path-based token', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1699996400000))

    const url = generateSignedUrl(
      'https://stream.example.com/vid123/playlist.m3u8',
      'test-security-key',
      { expiresIn: 3600 },
      { tokenPath: '/vid123/', userIp: '203.0.113.7' },
    )

    expect(url).toBe(
      'https://stream.example.com/bcdn_token=k9na9ywwLzBK9IUB_b68dAymR22AL92rQJR3mTnyAkI&token_path=%2Fvid123%2F&expires=1700000000/vid123/playlist.m3u8',
    )
  })
})

describe('absolute expiry (expiresAt option)', () => {
  it('uses the absolute timestamp as the expires value in hash and URL', () => {
    const url = generateSignedUrl(
      'https://cdn.example.com/file.jpg',
      'test-security-key',
      { expiresIn: 3600 },
      { expiresAt: 1800000000 },
    )

    expect(url).toBe(
      'https://cdn.example.com/file.jpg?token=dnOPvXnJbXAT1DoKqqvYP2nr0GQai6nYSbLUKhiTfjw&expires=1800000000',
    )
  })

  it('ignores non-positive expiresAt and falls back to expiresIn', () => {
    const before = Math.floor(Date.now() / 1000)
    const url = generateSignedUrl(
      'https://cdn.example.com/file.jpg',
      'test-security-key',
      { expiresIn: 3600 },
      { expiresAt: 0 },
    )
    const after = Math.floor(Date.now() / 1000)

    const expires = Number(new URL(url).searchParams.get('expires'))
    expect(expires).toBeGreaterThanOrEqual(before + 3600)
    expect(expires).toBeLessThanOrEqual(after + 3600 + 1)
  })
})

describe('generateSignedToken', () => {
  const securityKey = 'test-security-key'
  const signedUrl = '/path/to/file.jpg'
  const expiration = 1700000000

  it('throws without securityKey', () => {
    expect(() => generateSignedToken('', signedUrl, expiration)).toThrow(
      'Security key, signed URL, and expiration time are required',
    )
  })

  it('throws with negative expiration', () => {
    expect(() => generateSignedToken(securityKey, signedUrl, -1)).toThrow(
      'Security key, signed URL, and expiration time are required',
    )
  })
})

describe('generateSignedUrl', () => {
  const securityKey = 'test-security-key'
  const baseConfig = {
    expiresIn: 3600,
  }

  describe('storage URLs (query params)', () => {
    it('preserves existing query params', () => {
      const url = generateSignedUrl(
        'https://cdn.example.com/path/to/file.jpg?width=100&height=200',
        securityKey,
        baseConfig,
      )

      expect(url).toContain('width=100')
      expect(url).toContain('height=200')
      expect(url).toContain('token=')
      expect(url).toContain('expires=')
    })
  })

  describe('country restrictions', () => {
    it('includes both country restrictions when provided', () => {
      const url = generateSignedUrl('https://cdn.example.com/file.jpg', securityKey, {
        ...baseConfig,
        allowedCountries: ['US'],
        blockedCountries: ['CN'],
      })

      expect(url).toContain('token_countries=US')
      expect(url).toContain('token_countries_blocked=CN')
    })
  })

  describe('error handling', () => {
    it('throws on invalid URL format', () => {
      expect(() => generateSignedUrl('not-a-valid-url', securityKey, baseConfig)).toThrow('Invalid URL format')
    })

    it('throws without baseUrl', () => {
      expect(() => generateSignedUrl('', securityKey, baseConfig)).toThrow(
        'Base URL, security key, and configuration are required',
      )
    })

    it('throws without securityKey', () => {
      expect(() => generateSignedUrl('https://cdn.example.com/file.jpg', '', baseConfig)).toThrow(
        'Base URL, security key, and configuration are required',
      )
    })
  })

  describe('URL construction', () => {
    it('handles URLs with port numbers', () => {
      const url = generateSignedUrl('https://cdn.example.com:8443/file.jpg', securityKey, baseConfig)

      expect(url).toContain('cdn.example.com:8443')
      expect(url).toContain('token=')
    })

    it('signs the decoded path and keeps the encoded one in the URL', () => {
      vi.useFakeTimers({ now: 1699996400000 })
      const url = generateSignedUrl('https://cdn.example.com/path/to/file%20name.jpg', securityKey, baseConfig)
      vi.useRealTimers()

      expect(url).toBe(
        `https://cdn.example.com/path/to/file%20name.jpg?token=${rawToken(`${securityKey}/path/to/file name.jpg1700000000`)}&expires=1700000000`,
      )
    })

    it('uses the default expiresIn (7200 s) when none is given', () => {
      const url = generateSignedUrl('https://cdn.example.com/file.jpg', securityKey, {})

      const expiresMatch = url.match(/expires=(\d+)/)
      expect(expiresMatch).not.toBeNull()

      const expires = parseInt(expiresMatch![1], 10)
      const now = Math.floor(Date.now() / 1000)
      expect(expires).toBeGreaterThan(now + 7000)
      expect(expires).toBeLessThan(now + 7400)
    })
  })
})

describe('generateStreamTusUploadSignature', () => {
  const validParams = {
    apiKey: 'test-api-key',
    expirationTime: 1700000000,
    libraryId: 12345,
    videoId: 'abc-123-def',
  }

  it('generates the correct hex SHA-256', () => {
    const signature = generateStreamTusUploadSignature(validParams)

    expect(signature).toMatch(/^[a-f0-9]{64}$/)

    const expectedData = `${validParams.libraryId}${validParams.apiKey}${validParams.expirationTime}${validParams.videoId}`
    const expectedHash = createHash('sha256').update(expectedData).digest('hex')
    expect(signature).toBe(expectedHash)
  })

  it('throws without libraryId', () => {
    expect(() =>
      generateStreamTusUploadSignature({
        ...validParams,
        libraryId: 0,
      }),
    ).toThrow('Library ID, API key, expiration time, and video ID are required')
  })

  it('throws without videoId', () => {
    expect(() =>
      generateStreamTusUploadSignature({
        ...validParams,
        videoId: '',
      }),
    ).toThrow('Library ID, API key, expiration time, and video ID are required')
  })
})

describe('stream video token', () => {
  const user = { collection: 'users', id: 'user-1' } as never
  const input = { collection: 'media', libraryId: 12345, secret: 'payload-secret', user, videoId: 'video-1' }

  it('builds the token from the expiry and an HMAC-SHA256 of the collection, library, video, user and expiry, keyed by the Payload secret', () => {
    vi.useFakeTimers({ now: 1_700_000_000_500 })
    const token = signStreamVideoToken(input)
    vi.useRealTimers()
    const [expiresAt, digest] = token.split('.')
    const expected = createHmac('sha256', 'payload-secret')
      .update(`stream-video:media:12345:video-1:users:user-1:${expiresAt}`)
      .digest('hex')
    expect(digest).toBe(expected)
    expect(Number(expiresAt)).toBe(1_700_000_000 + 24 * 60 * 60)
  })

  it('verifies a token signed for the same video', () => {
    expect(verifyStreamVideoToken({ ...input, token: signStreamVideoToken(input) })).toBe(true)
  })

  it.each([
    ['another collection', { collection: 'other' }],
    ['another library', { libraryId: 1 }],
    ['another video', { videoId: 'video-2' }],
    ['another secret', { secret: 'other-secret' }],
    ['another user', { user: { collection: 'users', id: 'user-2' } as never }],
    ['another user collection', { user: { collection: 'admins', id: 'user-1' } as never }],
    ['no user', { user: null }],
  ])('rejects a token signed for %s', (_label, change) => {
    const token = signStreamVideoToken({ ...input, ...change })
    expect(verifyStreamVideoToken({ ...input, token })).toBe(false)
  })

  it.each([undefined, '', 42, 'short', `${signStreamVideoToken(input)}.x`])(
    'rejects a missing or malformed token (%s)',
    (token) => {
      expect(verifyStreamVideoToken({ ...input, token })).toBe(false)
    },
  )

  it('rejects any token when the video id is empty', () => {
    const token = signStreamVideoToken({ ...input, videoId: '' })
    expect(verifyStreamVideoToken({ ...input, token, videoId: '' })).toBe(false)
  })
})
