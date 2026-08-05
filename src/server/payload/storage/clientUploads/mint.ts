import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

const SIGNATURE_PARAM = 'X-Upload-Signature'
const DEFAULT_EXPIRES_IN_MS = 900_000

export type MintEdgeUploadUrlArgs = {
  expiresInMs?: number
  maxSize: number
  nonce?: string
  now?: number
  path: string
  scriptUrl: string
  secret: string
  zoneName: string
}

export const buildEdgeCanonical = (scriptUrl: string, params: URLSearchParams): string =>
  `${scriptUrl}/upload?${params.toString()}`

export const signEdgeCanonical = (canonical: string, secret: string): string =>
  createHmac('sha256', secret).update(canonical).digest('hex')

export const mintEdgeUploadUrl = ({
  expiresInMs,
  maxSize,
  nonce,
  now,
  path,
  scriptUrl,
  secret,
  zoneName,
}: MintEdgeUploadUrlArgs): string => {
  const params = new URLSearchParams({
    'X-Upload-Path': path,
    'X-Upload-Max-Size': String(maxSize),
    'X-Upload-Expires': String((now ?? Date.now()) + (expiresInMs ?? DEFAULT_EXPIRES_IN_MS)),
    'X-Upload-Nonce': nonce ?? randomUUID(),
    'X-Upload-Zone': zoneName,
  })

  const canonical = buildEdgeCanonical(scriptUrl, params)
  const signature = signEdgeCanonical(canonical, secret)

  return `${canonical}&${SIGNATURE_PARAM}=${signature}`
}

export type VerifyEdgeUploadUrlResult = {
  reason?: string
  valid: boolean
}

export const verifyEdgeUploadUrl = (
  urlString: string,
  secret: string,
  now: number = Date.now(),
): VerifyEdgeUploadUrlResult => {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    return { reason: 'invalid url', valid: false }
  }

  const provided = url.searchParams.get(SIGNATURE_PARAM)
  if (!provided) {
    return { reason: 'missing signature', valid: false }
  }

  const params = new URLSearchParams(url.searchParams)
  params.delete(SIGNATURE_PARAM)

  const canonical = `${url.origin}${url.pathname}?${params.toString()}`
  const expected = signEdgeCanonical(canonical, secret)

  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return { reason: 'bad signature', valid: false }
  }

  const expires = Number(url.searchParams.get('X-Upload-Expires'))
  if (!Number.isFinite(expires) || expires < now) {
    return { reason: 'expired', valid: false }
  }

  return { valid: true }
}
