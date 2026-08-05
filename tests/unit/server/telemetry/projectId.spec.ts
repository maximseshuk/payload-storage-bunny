import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { deriveProjectId, hashProjectId, resolveRawSource } from '@/server/telemetry/projectId.js'

describe('hashProjectId', () => {
  it('is sha256(secret + rawSource) hex', () => {
    const secret = 'secret'
    const source = 'source'
    const expected = createHash('sha256')
      .update(secret + source)
      .digest('hex')
    expect(hashProjectId(secret, source)).toBe(expected)
  })

  it('is deterministic and 64 hex chars', () => {
    const a = hashProjectId('s', 'git@example')
    expect(a).toBe(hashProjectId('s', 'git@example'))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('uses the secret only as salt — a different secret changes the digest', () => {
    expect(hashProjectId('secret-a', 'source')).not.toBe(hashProjectId('secret-b', 'source'))
  })
})

describe('resolveRawSource', () => {
  it('prefers git over everything', () => {
    expect(resolveRawSource({ cwd: '/app', git: 'git@x', packageJSON: 'app', serverURL: 'https://x' })).toEqual({
      source: 'git',
      value: 'git@x',
    })
  })

  it('falls back to packageJSON, then serverURL, then cwd', () => {
    expect(resolveRawSource({ cwd: '/app', packageJSON: 'app', serverURL: 'https://x' })).toEqual({
      source: 'packageJSON',
      value: 'app',
    })
    expect(resolveRawSource({ cwd: '/app', serverURL: 'https://x' })).toEqual({
      source: 'serverURL',
      value: 'https://x',
    })
    expect(resolveRawSource({ cwd: '/app' })).toEqual({ source: 'cwd', value: '/app' })
  })
})

describe('deriveProjectId', () => {
  it('reports the winning source and hashes its value with the secret', () => {
    const result = deriveProjectId({ git: 'git@example.com:me/app.git', packageJSON: 'app', secret: 'sekret' })

    expect(result.projectIdSource).toBe('git')
    expect(result.projectId).toBe(hashProjectId('sekret', 'git@example.com:me/app.git'))
  })
})
