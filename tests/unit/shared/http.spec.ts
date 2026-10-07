import { describe, expect, it } from 'vitest'

import { copyHeaders, createProxyResponse, jsonResponse, trimTrailingSlashes } from '@/shared/http.js'

describe('http utils', () => {
  describe('copyHeaders', () => {
    it('copies every header entry into a new Headers instance', () => {
      const src = new Headers({ 'Content-Type': 'text/plain', 'X-Custom': 'abc' })
      const copy = copyHeaders(src)

      expect(copy.get('content-type')).toBe('text/plain')
      expect(copy.get('x-custom')).toBe('abc')
    })

    it('returns independent Headers that do not change the source', () => {
      const src = new Headers({ 'X-Custom': 'original' })
      const copy = copyHeaders(src)

      copy.set('X-Custom', 'changed')
      copy.set('X-New', 'added')

      expect(src.get('x-custom')).toBe('original')
      expect(src.get('x-new')).toBeNull()
    })
  })

  describe('copyHeaders privacy', () => {
    it('keeps the upstream max-age but makes the response private and drops cookies', () => {
      const copy = copyHeaders(
        new Headers({
          'cache-control': 'public, max-age=31536000',
          'content-type': 'image/jpeg',
          'set-cookie': 'cdn=1',
          vary: 'Accept',
        }),
      )

      expect(copy.get('cache-control')).toBe('private, max-age=31536000')
      expect(copy.get('vary')).toBe('Accept, Cookie, Authorization')
      expect(copy.get('set-cookie')).toBeNull()
      expect(copy.get('content-type')).toBe('image/jpeg')
    })

    it.each([
      ['no cache-control', {}],
      ['only s-maxage', { 'cache-control': 'public, s-maxage=600' }],
    ])('uses max-age=0 with %s', (_label, headers) => {
      const copy = copyHeaders(new Headers(headers))

      expect(copy.get('cache-control')).toBe('private, max-age=0')
      expect(copy.get('vary')).toBe('Cookie, Authorization')
    })

    it('makes proxied responses private', () => {
      const res = createProxyResponse(new Response('x', { headers: { 'cache-control': 'public, max-age=60' } }))

      expect(res.headers.get('cache-control')).toBe('private, max-age=60')
    })
  })

  describe('jsonResponse', () => {
    it('serializes data with a JSON content-type and default 200 status', async () => {
      const res = jsonResponse({ hello: 'world' })

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/json')
      expect(await res.json()).toEqual({ hello: 'world' })
    })

    it('uses an explicit status code', async () => {
      const res = jsonResponse({ error: 'nope' }, 401)

      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'nope' })
    })
  })

  describe('trimTrailingSlashes', () => {
    it('strips every trailing slash', () => {
      expect(trimTrailingSlashes('a///')).toBe('a')
      expect(trimTrailingSlashes('https://x.b-cdn.net/')).toBe('https://x.b-cdn.net')
      expect(trimTrailingSlashes('///')).toBe('')
    })

    it('leaves leading and inner slashes untouched', () => {
      expect(trimTrailingSlashes('/a/b/c')).toBe('/a/b/c')
      expect(trimTrailingSlashes('no-slash')).toBe('no-slash')
      expect(trimTrailingSlashes('')).toBe('')
    })

    it('handles a long run of slashes', () => {
      expect(trimTrailingSlashes(`a${'/'.repeat(100_000)}b${'/'.repeat(100_000)}`)).toBe(`a${'/'.repeat(100_000)}b`)
    })
  })

  describe('createProxyResponse', () => {
    it('defaults the status to the source response status', () => {
      const original = new Response('body', { headers: { 'X-Test': '1' }, status: 201 })
      const res = createProxyResponse(original)

      expect(res.status).toBe(201)
      expect(res.headers.get('x-test')).toBe('1')
    })

    it('overrides the status when provided', () => {
      const original = new Response('body', { status: 500 })
      const res = createProxyResponse(original, { status: 200 })

      expect(res.status).toBe(200)
    })

    it('merges additionalHeaders without mutating the source headers', () => {
      const original = new Response('body', { headers: { 'X-Test': '1' }, status: 200 })
      const res = createProxyResponse(original, { additionalHeaders: { 'X-New': 'added' } })

      expect(res.headers.get('x-test')).toBe('1')
      expect(res.headers.get('x-new')).toBe('added')
      expect(original.headers.get('x-new')).toBeNull()
    })

    it('forwards the original body', async () => {
      const original = new Response('hello-body', { status: 200 })
      const res = createProxyResponse(original)

      expect(await res.text()).toBe('hello-body')
    })
  })
})
