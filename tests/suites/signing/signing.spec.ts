import { createHash } from 'crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateSignedToken, generateSignedUrl } from '@/cdn/tokenAuth.js'
import { generateStreamTusUploadSignature } from '@/stream/tusSignature.js'

const rawToken = (hashable: string) =>
  createHash('sha256').update(hashable).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

describe('token output lock (must stay byte-identical to the verified Bunny standard scheme)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pins token for key + path + expires', () => {
    expect(generateSignedToken('test-security-key', '/path/to/file.jpg', 1700000000)).toBe(
      'SxFvxHGdfK9v7p53gmnSvd84VLGy2GlsIrPBoCPGqns',
    )
  })

  it('pins token for key + path + expires + sorted params', () => {
    expect(
      generateSignedToken('test-security-key', '/path/to/file.jpg', 1700000000, 'token_countries=US,CA&width=500'),
    ).toBe('d8_U6ufdeoXh1KgeBCjJHu3Di1Tlh_uMPWAbCfi9Ahg')
  })

  it('pins token for token_path signing', () => {
    expect(generateSignedToken('test-security-key', '/videos/', 1700000000, 'token_path=/videos/')).toBe(
      'LK4PNazpPWHPtkD4ShDMsm7fGD8Bvg0HV5monXaghkg',
    )
  })

  it('pins full query-mode URL output', () => {
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

  it('pins full path-mode URL output', () => {
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

  it('pins plain URL output without extra params', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1699996400000))

    const url = generateSignedUrl('https://cdn.example.com/file.jpg', 'test-security-key', { expiresIn: 3600 })

    expect(url).toBe(
      'https://cdn.example.com/file.jpg?token=-UDRI8YaL5AmYgvcAaAfm2dJqCOTm0bcqtXm3mCUjMA&expires=1700000000',
    )
  })
})

describe('IP-locked tokens (standard scheme: key + path + expires + ip + sorted params)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const securityKey = 'test-security-key'
  const signaturePath = '/path/to/file.jpg'
  const expires = '1700000000'
  const userIp = '192.168.1.1'
  const sortedParams = 'token_countries=US,CA&width=500'

  it('hashes the IP between expires and params', () => {
    const token = generateSignedToken(securityKey, signaturePath, 1700000000, undefined, userIp)

    expect(token).toBe(rawToken(securityKey + signaturePath + expires + userIp))
    expect(token).toBe('28C0lC5Wc2I6oClnXZMYt5cVIjN_lT8WVIGIi5Uo9sk')
  })

  it('hashes the IP before sorted params when both are present', () => {
    const token = generateSignedToken(securityKey, signaturePath, 1700000000, sortedParams, userIp)

    expect(token).toBe(rawToken(securityKey + signaturePath + expires + userIp + sortedParams))
    expect(token).toBe('bHSXubiYmOXgqHxcYEZBdSyZbLG_5w82_uaq3yqTIL0')
  })

  it('produces the legacy token when IP is absent', () => {
    expect(generateSignedToken('test-security-key', '/path/to/file.jpg', 1700000000, undefined, undefined)).toBe(
      generateSignedToken('test-security-key', '/path/to/file.jpg', 1700000000),
    )
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
      'https://cdn.example.com/file.jpg?token_countries=US%2CCA&token=ftxhlK6aaJ7ZjP6ySjcLiZrAciXB7V-hIh0Q8Sra2gs&expires=1700000000',
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
      'https://stream.example.com/bcdn_token=gCCs31C4cphAaMuQ-mbtHi1IqJroLV_MMEe7tb9zNA8&token_path=%2Fvid123%2F&expires=1700000000/vid123/playlist.m3u8',
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

  it('generates consistent SHA256 token', () => {
    const token1 = generateSignedToken(securityKey, signedUrl, expiration)
    const token2 = generateSignedToken(securityKey, signedUrl, expiration)

    expect(token1).toBe(token2)
    expect(token1.length).toBeGreaterThan(0)
  })

  it('throws without securityKey', () => {
    expect(() => generateSignedToken('', signedUrl, expiration)).toThrow(
      'Security key, signed URL, and expiration time are required',
    )
  })

  it('throws without signedUrl', () => {
    expect(() => generateSignedToken(securityKey, '', expiration)).toThrow(
      'Security key, signed URL, and expiration time are required',
    )
  })

  it('throws without expiration', () => {
    expect(() => generateSignedToken(securityKey, signedUrl, 0)).toThrow(
      'Security key, signed URL, and expiration time are required',
    )
  })

  it('throws with negative expiration', () => {
    expect(() => generateSignedToken(securityKey, signedUrl, -1)).toThrow(
      'Security key, signed URL, and expiration time are required',
    )
  })

  it('includes queryParams in hash when provided', () => {
    const withoutParams = generateSignedToken(securityKey, signedUrl, expiration)
    const withParams = generateSignedToken(securityKey, signedUrl, expiration, 'foo=bar')

    expect(withoutParams).not.toBe(withParams)
  })

  it('produces URL-safe base64 (no +, /, =)', () => {
    const tokens: string[] = []
    for (let i = 0; i < 10; i++) {
      tokens.push(generateSignedToken(securityKey, `/file-${i}.jpg`, expiration + i))
    }

    for (const token of tokens) {
      expect(token).not.toContain('+')
      expect(token).not.toContain('/')
      expect(token).not.toContain('=')
      expect(token).not.toContain('\n')
    }
  })

  it('uses - instead of + and _ instead of /', () => {
    const token = generateSignedToken(securityKey, signedUrl, expiration)
    expect(token).toMatch(/^[\w-]+$/)
  })
})

describe('generateSignedUrl', () => {
  const securityKey = 'test-security-key'
  const baseConfig = {
    expiresIn: 3600,
  }

  describe('storage URLs (query params)', () => {
    it('adds token and expires to query params', () => {
      const url = generateSignedUrl('https://cdn.example.com/path/to/file.jpg', securityKey, baseConfig)

      expect(url).toContain('token=')
      expect(url).toContain('expires=')
    })

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

    it('sets correct expiration timestamp', () => {
      const beforeTime = Math.floor(Date.now() / 1000)
      const url = generateSignedUrl('https://cdn.example.com/file.jpg', securityKey, { expiresIn: 7200 })
      const afterTime = Math.floor(Date.now() / 1000)

      const expiresMatch = url.match(/expires=(\d+)/)
      expect(expiresMatch).not.toBeNull()

      const expires = parseInt(expiresMatch![1], 10)
      expect(expires).toBeGreaterThanOrEqual(beforeTime + 7200)
      expect(expires).toBeLessThanOrEqual(afterTime + 7200 + 1)
    })
  })

  describe('stream URLs (path-based token)', () => {
    it('uses path-based token for stream (with tokenPath)', () => {
      const url = generateSignedUrl('https://stream.example.com/abc123/playlist.m3u8', securityKey, baseConfig, {
        tokenPath: '/abc123/',
      })

      expect(url).toContain('/bcdn_token=')
      expect(url).toContain('&expires=')
      expect(url).toContain('/playlist.m3u8')
    })

    it('preserves pathname after token in path-based mode', () => {
      const url = generateSignedUrl('https://stream.example.com/video123/playlist.m3u8', securityKey, baseConfig, {
        tokenPath: '/video123/',
      })

      expect(url).toMatch(/\/bcdn_token=.*\/video123\/playlist\.m3u8/)
    })
  })

  describe('country restrictions', () => {
    it('includes token_countries for allowedCountries', () => {
      const url = generateSignedUrl('https://cdn.example.com/file.jpg', securityKey, {
        ...baseConfig,
        allowedCountries: ['US', 'CA', 'GB'],
      })

      expect(url).toContain('token_countries=US%2CCA%2CGB')
    })

    it('includes token_countries_blocked for blockedCountries', () => {
      const url = generateSignedUrl('https://cdn.example.com/file.jpg', securityKey, {
        ...baseConfig,
        blockedCountries: ['RU', 'CN'],
      })

      expect(url).toContain('token_countries_blocked=RU%2CCN')
    })

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

    it('throws without config', () => {
      expect(() => generateSignedUrl('https://cdn.example.com/file.jpg', securityKey, null as any)).toThrow(
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

    it('handles URLs with special characters in path', () => {
      const url = generateSignedUrl('https://cdn.example.com/path/to/file%20name.jpg', securityKey, baseConfig)

      expect(url).toContain('/path/to/file%20name.jpg')
      expect(url).toContain('token=')
    })

    it('uses default expiresIn (7200s) when not provided', () => {
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

  it('generates correct hex SHA256', () => {
    const signature = generateStreamTusUploadSignature(validParams)

    expect(signature).toMatch(/^[a-f0-9]{64}$/)

    const expectedData = `${validParams.libraryId}${validParams.apiKey}${validParams.expirationTime}${validParams.videoId}`
    const expectedHash = createHash('sha256').update(expectedData).digest('hex')
    expect(signature).toBe(expectedHash)
  })

  it('generates consistent signatures', () => {
    const sig1 = generateStreamTusUploadSignature(validParams)
    const sig2 = generateStreamTusUploadSignature(validParams)

    expect(sig1).toBe(sig2)
  })

  it('generates different signatures for different inputs', () => {
    const sig1 = generateStreamTusUploadSignature(validParams)
    const sig2 = generateStreamTusUploadSignature({
      ...validParams,
      videoId: 'different-video-id',
    })

    expect(sig1).not.toBe(sig2)
  })

  it('throws without libraryId', () => {
    expect(() =>
      generateStreamTusUploadSignature({
        ...validParams,
        libraryId: 0,
      }),
    ).toThrow('Library ID, API key, expiration time, and video ID are required')
  })

  it('throws without apiKey', () => {
    expect(() =>
      generateStreamTusUploadSignature({
        ...validParams,
        apiKey: '',
      }),
    ).toThrow('Library ID, API key, expiration time, and video ID are required')
  })

  it('throws without expirationTime', () => {
    expect(() =>
      generateStreamTusUploadSignature({
        ...validParams,
        expirationTime: 0,
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
