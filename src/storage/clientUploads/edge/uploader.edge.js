import * as BunnySDK from 'https://esm.sh/@bunny.net/edgescript-sdk@0.11.2'

const env = (name) => globalThis.Deno?.env?.get?.(name) ?? globalThis.process?.env?.[name] ?? ''

const SHARED_SECRET = env('SHARED_SECRET')
const STORAGE_HOST = env('STORAGE_HOST')
const STORAGE_ZONE = env('STORAGE_ZONE')
const STORAGE_ACCESS_KEY = env('STORAGE_ACCESS_KEY')
const ALLOWED_ORIGINS = env('ALLOWED_ORIGINS') || '*'

const SIGNATURE_PARAM = 'X-Upload-Signature'
const VERSION = '__PSB_EDGE_VERSION__'
const encoder = new TextEncoder()

const toHex = (buffer) => {
  const bytes = new Uint8Array(buffer)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

const hmacHex = async (secret, message) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return toHex(signature)
}

const timingSafeEqual = (a, b) => {
  if (a.length !== b.length) {
    return false
  }
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

const allowedOrigin = (request) => {
  const origin = request.headers.get('Origin')
  if (ALLOWED_ORIGINS === '*') {
    return '*'
  }
  const list = ALLOWED_ORIGINS.split(',').map((value) => value.trim())
  return origin && list.includes(origin) ? origin : (list[0] ?? '*')
}

const withCors = (response, request) => {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', allowedOrigin(request))
  headers.set('Access-Control-Allow-Methods', 'PUT, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  headers.set('Access-Control-Max-Age', '86400')
  headers.set('Vary', 'Origin')
  headers.set('X-Edge-Version', VERSION)
  headers.set('Access-Control-Expose-Headers', 'X-Edge-Version')
  return new Response(response.body, { status: response.status, headers })
}

const isUnsafePath = (path) =>
  !path || path.startsWith('/') || path.split('/').some((segment) => segment === '..' || segment === '.')

BunnySDK.net.http.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return withCors(new Response(null, { status: 204 }), request)
  }

  if (request.method !== 'PUT') {
    return withCors(new Response('Method Not Allowed', { status: 405 }), request)
  }

  const url = new URL(request.url)
  const provided = url.searchParams.get(SIGNATURE_PARAM)
  if (!provided) {
    return withCors(new Response('Missing signature', { status: 401 }), request)
  }

  const params = new URLSearchParams(url.searchParams)
  params.delete(SIGNATURE_PARAM)
  const canonical = url.origin + url.pathname + '?' + params.toString()
  const expected = await hmacHex(SHARED_SECRET, canonical)
  if (!timingSafeEqual(provided, expected)) {
    return withCors(new Response('Invalid signature', { status: 401 }), request)
  }

  const expires = Number(url.searchParams.get('X-Upload-Expires'))
  if (!Number.isFinite(expires) || expires < Date.now()) {
    return withCors(new Response('Upload URL expired', { status: 401 }), request)
  }

  const path = url.searchParams.get('X-Upload-Path') ?? ''
  if (isUnsafePath(path)) {
    return withCors(new Response('Invalid upload path', { status: 400 }), request)
  }

  const maxSize = Number(url.searchParams.get('X-Upload-Max-Size'))
  const contentLength = Number(request.headers.get('Content-Length'))

  if (Number.isFinite(maxSize)) {
    if (!Number.isFinite(contentLength)) {
      return withCors(new Response('Content-Length required', { status: 411 }), request)
    }
    if (contentLength > maxSize) {
      return withCors(new Response('File too large', { status: 413 }), request)
    }
  }

  let body = request.body
  let sizeExceeded = false
  if (Number.isFinite(maxSize) && body) {
    let transferred = 0
    body = body.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          transferred += chunk.byteLength
          if (transferred > maxSize) {
            sizeExceeded = true
            controller.error(new Error('max-size exceeded'))
            return
          }
          controller.enqueue(chunk)
        },
      }),
    )
  }

  let upstream
  try {
    upstream = await fetch('https://' + STORAGE_HOST + '/' + STORAGE_ZONE + '/' + path, {
      method: 'PUT',
      body,
      duplex: 'half',
      headers: {
        AccessKey: STORAGE_ACCESS_KEY,
        'Content-Type': request.headers.get('Content-Type') ?? 'application/octet-stream',
      },
    })
  } catch (err) {
    if (sizeExceeded) {
      return withCors(new Response('File too large', { status: 413 }), request)
    }
    throw err
  }

  return withCors(new Response(upstream.body, { status: upstream.status }), request)
})
