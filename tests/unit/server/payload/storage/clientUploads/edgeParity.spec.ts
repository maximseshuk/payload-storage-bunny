import { describe, expect, it } from 'vitest'

import { mintEdgeUploadUrl } from '@/server/payload/storage/clientUploads/mint.js'

/**
 * The edge signature has two independent crypto backends: mint.ts signs with Node's
 * `crypto.createHmac` (hex), and src/edge/uploader.edge.js verifies with WebCrypto
 * `crypto.subtle`. If either canonicalizer or HMAC path drifts, mint would sign URLs
 * the edge rejects — a failure invisible to mint's own round-trip test.
 *
 * uploader.edge.js can't be imported here: it pulls from esm.sh and reads globalThis.Deno.
 * So this suite replicates the edge's verification path faithfully (the toHex / hmacHex /
 * timingSafeEqual / canonical-construction block below is copied verbatim from that module)
 * and asserts a URL minted by the REAL mint.ts verifies under WebCrypto — proving the two
 * crypto backends agree bit-for-bit over the same canonical.
 *
 * Covered: canonical-string + HMAC-backend parity, plus tamper/wrong-secret rejection.
 * NOT covered: execution of the literal Deno module (routing, CORS, zone lookup, streaming).
 */

// --- copied verbatim from src/edge/uploader.edge.js ---
const SIGNATURE_PARAM = 'X-Upload-Signature'
const encoder = new TextEncoder()

const toHex = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

const hmacHex = async (secret: string, message: string): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return toHex(signature)
}

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false
  }
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

const verifyOnEdge = async (urlString: string, secret: string): Promise<boolean> => {
  const url = new URL(urlString)
  const provided = url.searchParams.get(SIGNATURE_PARAM)
  if (!provided) {
    return false
  }
  const params = new URLSearchParams(url.searchParams)
  params.delete(SIGNATURE_PARAM)
  const canonical = url.origin + url.pathname + '?' + params.toString()
  const expected = await hmacHex(secret, canonical)
  return timingSafeEqual(provided, expected)
}
// --- end copied block ---

const base = {
  maxSize: 1024,
  path: 'media/photo.jpg',
  scriptUrl: 'https://uploader.b-cdn.net',
  secret: 'shared-secret',
  zoneName: 'media',
}
const now = 1_700_000_000_000

describe('edge signature backend parity (mint createHmac vs edge crypto.subtle)', () => {
  it('a URL minted by mint.ts verifies under the edge WebCrypto path', async () => {
    const url = mintEdgeUploadUrl({ ...base, nonce: 'fixed-nonce', now })
    await expect(verifyOnEdge(url, base.secret)).resolves.toBe(true)
  })

  it('the two HMAC backends produce the same hex digest for the same canonical', async () => {
    const url = mintEdgeUploadUrl({ ...base, nonce: 'fixed-nonce', now })
    const parsed = new URL(url)
    const mintSignature = parsed.searchParams.get(SIGNATURE_PARAM)!
    parsed.searchParams.delete(SIGNATURE_PARAM)
    const canonical = parsed.origin + parsed.pathname + '?' + parsed.searchParams.toString()

    expect(await hmacHex(base.secret, canonical)).toBe(mintSignature)
  })

  it('rejects a tampered param under the edge path', async () => {
    const url = mintEdgeUploadUrl({ ...base, nonce: 'n', now })
    const tampered = url.replace('media%2Fphoto.jpg', 'media%2Fevil.jpg')
    await expect(verifyOnEdge(tampered, base.secret)).resolves.toBe(false)
  })

  it('rejects a single flipped signature byte under the edge path', async () => {
    const url = mintEdgeUploadUrl({ ...base, nonce: 'n', now })
    const parsed = new URL(url)
    const sig = parsed.searchParams.get(SIGNATURE_PARAM)!
    const flipped = (sig[0] === '0' ? '1' : '0') + sig.slice(1)
    parsed.searchParams.set(SIGNATURE_PARAM, flipped)

    await expect(verifyOnEdge(parsed.toString(), base.secret)).resolves.toBe(false)
  })

  it('rejects a wrong secret under the edge path', async () => {
    const url = mintEdgeUploadUrl({ ...base, nonce: 'n', now })
    await expect(verifyOnEdge(url, 'other-secret')).resolves.toBe(false)
  })
})
