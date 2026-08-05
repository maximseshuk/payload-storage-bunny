import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { appendEnvLines } from '@/cli/lib/envFile.js'
import type { EnvEntry } from '@/cli/lib/envFile.js'

const entries: EnvEntry[] = [
  { name: 'BUNNY_STORAGE_API_KEY', value: 'zone-pass' },
  { name: 'BUNNY_STORAGE_HOSTNAME', value: 'my-app.b-cdn.net' },
]

describe('appendEnvLines', () => {
  let dir: string

  afterEach(() => {
    if (dir) {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  const inDir = (): string => {
    dir = mkdtempSync(path.join(tmpdir(), 'psb-init-env-'))
    return path.join(dir, '.env')
  }

  it('creates the file when it is missing', () => {
    const file = inDir()
    const result = appendEnvLines(file, entries)

    expect(result.created).toBe(true)
    expect(result.appended).toEqual(['BUNNY_STORAGE_API_KEY', 'BUNNY_STORAGE_HOSTNAME'])
    expect(result.skipped).toEqual([])
    expect(readFileSync(file, 'utf8')).toBe(
      'BUNNY_STORAGE_API_KEY=zone-pass\nBUNNY_STORAGE_HOSTNAME=my-app.b-cdn.net\n',
    )
  })

  it('appends only missing names to an existing file and preserves a trailing newline', () => {
    const file = inDir()
    writeFileSync(file, 'EXISTING=1\n')

    const result = appendEnvLines(file, entries)

    expect(result.created).toBe(false)
    expect(result.appended).toEqual(['BUNNY_STORAGE_API_KEY', 'BUNNY_STORAGE_HOSTNAME'])
    expect(readFileSync(file, 'utf8')).toBe(
      'EXISTING=1\nBUNNY_STORAGE_API_KEY=zone-pass\nBUNNY_STORAGE_HOSTNAME=my-app.b-cdn.net\n',
    )
  })

  it('adds a separating newline when the existing file has no trailing newline', () => {
    const file = inDir()
    writeFileSync(file, 'EXISTING=1')

    appendEnvLines(file, [{ name: 'NEW_ONE', value: 'x' }])

    expect(readFileSync(file, 'utf8')).toBe('EXISTING=1\nNEW_ONE=x\n')
  })

  it('never overwrites an existing value and reports the collision', () => {
    const file = inDir()
    writeFileSync(file, 'BUNNY_STORAGE_API_KEY=do-not-touch\n')

    const result = appendEnvLines(file, entries)

    expect(result.skipped).toEqual(['BUNNY_STORAGE_API_KEY'])
    expect(result.appended).toEqual(['BUNNY_STORAGE_HOSTNAME'])
    const contents = readFileSync(file, 'utf8')
    expect(contents).toContain('BUNNY_STORAGE_API_KEY=do-not-touch')
    expect(contents).not.toContain('zone-pass')
    expect(contents).toContain('BUNNY_STORAGE_HOSTNAME=my-app.b-cdn.net')
  })

  it('writes nothing new when every name already exists', () => {
    const file = inDir()
    writeFileSync(file, 'BUNNY_STORAGE_API_KEY=a\nBUNNY_STORAGE_HOSTNAME=b\n')

    const result = appendEnvLines(file, entries)

    expect(result.appended).toEqual([])
    expect(result.skipped).toEqual(['BUNNY_STORAGE_API_KEY', 'BUNNY_STORAGE_HOSTNAME'])
    expect(readFileSync(file, 'utf8')).toBe('BUNNY_STORAGE_API_KEY=a\nBUNNY_STORAGE_HOSTNAME=b\n')
  })
})
