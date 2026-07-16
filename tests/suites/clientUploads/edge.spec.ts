import { describe, expect, it } from 'vitest'

import { mintEdgeUploadUrl, verifyEdgeUploadUrl } from '@/storage/clientUploads/edge/mint.js'

const base = {
  maxSize: 1024,
  path: 'media/photo.jpg',
  scriptUrl: 'https://uploader.b-cdn.net',
  secret: 'shared-secret',
  zoneName: 'media',
}

describe('edge upload URL mint/verify', () => {
  it('mints a URL that verifies with the same secret', () => {
    const now = 1_700_000_000_000
    const url = mintEdgeUploadUrl({ ...base, nonce: 'fixed-nonce', now })

    expect(url.startsWith('https://uploader.b-cdn.net/upload?')).toBe(true)
    expect(url).toContain('X-Upload-Signature=')
    expect(verifyEdgeUploadUrl(url, base.secret, now + 1000)).toEqual({ valid: true })
  })

  it('is deterministic for a fixed nonce and time', () => {
    const now = 1_700_000_000_000
    const first = mintEdgeUploadUrl({ ...base, nonce: 'n', now })
    const second = mintEdgeUploadUrl({ ...base, nonce: 'n', now })
    expect(first).toBe(second)
  })

  it('rejects a tampered path', () => {
    const now = 1_700_000_000_000
    const url = mintEdgeUploadUrl({ ...base, nonce: 'n', now })
    const tampered = url.replace('media%2Fphoto.jpg', 'media%2Fevil.jpg')
    expect(verifyEdgeUploadUrl(tampered, base.secret, now).valid).toBe(false)
  })

  it('rejects a wrong secret', () => {
    const now = 1_700_000_000_000
    const url = mintEdgeUploadUrl({ ...base, nonce: 'n', now })
    expect(verifyEdgeUploadUrl(url, 'other-secret', now).valid).toBe(false)
  })

  it('rejects an expired URL', () => {
    const now = 1_700_000_000_000
    const url = mintEdgeUploadUrl({ ...base, expiresInMs: 1000, nonce: 'n', now })
    const result = verifyEdgeUploadUrl(url, base.secret, now + 2000)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('expired')
  })

  it('rejects a URL missing the signature', () => {
    expect(verifyEdgeUploadUrl('https://uploader.b-cdn.net/upload?X-Upload-Path=a', base.secret).valid).toBe(false)
  })

  it('signs the zone name into the minted URL', () => {
    const now = 1_700_000_000_000
    const url = mintEdgeUploadUrl({ ...base, nonce: 'n', now })
    expect(new URL(url).searchParams.get('X-Upload-Zone')).toBe('media')
    expect(verifyEdgeUploadUrl(url, base.secret, now + 1000)).toEqual({ valid: true })
  })

  it('rejects a URL whose zone was re-pointed after minting', () => {
    const now = 1_700_000_000_000
    const url = mintEdgeUploadUrl({ ...base, nonce: 'n', now })
    const tampered = url.replace('X-Upload-Zone=media', 'X-Upload-Zone=other')
    expect(verifyEdgeUploadUrl(tampered, base.secret, now + 1000).valid).toBe(false)
  })
})
