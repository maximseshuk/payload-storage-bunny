import { describe, expect, it } from 'vitest'

import { copyHeaders, createProxyResponse, jsonResponse, sanitizePrefix } from '@/shared/http.js'

describe('http utils', () => {
  describe('copyHeaders', () => {
    it('copies every header entry into a new Headers instance', () => {
      const src = new Headers({ 'Content-Type': 'text/plain', 'X-Custom': 'abc' })
      const copy = copyHeaders(src)

      expect(copy.get('content-type')).toBe('text/plain')
      expect(copy.get('x-custom')).toBe('abc')
    })

    it('returns an independent Headers (mutations do not affect the source)', () => {
      const src = new Headers({ 'X-Custom': 'original' })
      const copy = copyHeaders(src)

      copy.set('X-Custom', 'changed')
      copy.set('X-New', 'added')

      expect(src.get('x-custom')).toBe('original')
      expect(src.get('x-new')).toBeNull()
    })
  })

  describe('jsonResponse', () => {
    it('serializes data with a JSON content-type and default 200 status', async () => {
      const res = jsonResponse({ hello: 'world' })

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/json')
      expect(await res.json()).toEqual({ hello: 'world' })
    })

    it('honors an explicit status code', async () => {
      const res = jsonResponse({ error: 'nope' }, 401)

      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'nope' })
    })
  })

  describe('sanitizePrefix', () => {
    it('strips leading and trailing slashes', () => {
      expect(sanitizePrefix('/foo/')).toBe('foo')
      expect(sanitizePrefix('//a/b//')).toBe('a/b')
    })

    it('leaves inner slashes and slash-free values untouched', () => {
      expect(sanitizePrefix('a/b/c')).toBe('a/b/c')
      expect(sanitizePrefix('no-slash')).toBe('no-slash')
      expect(sanitizePrefix('')).toBe('')
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
