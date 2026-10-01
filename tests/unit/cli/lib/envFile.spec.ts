import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { appendEnvLines, applyEnvFile } from '@/cli/lib/envFile.js'
import type { EnvEntry } from '@/cli/lib/envFile.js'

import { useTmpDir } from '../../../helpers/unit/tmpDir.js'

describe('applyEnvFile', () => {
  const makeDir = useTmpDir('psb-env-')

  afterEach(() => {
    delete process.env.PSB_ENVFILE_PRESET
    delete process.env.PSB_ENVFILE_NEW
  })

  const writeEnvFile = (contents: string): string => {
    const file = path.join(makeDir(), '.env.test')
    writeFileSync(file, contents)
    return file
  }

  it('overrides a pre-set process env var (the whole point of --env-file)', () => {
    process.env.PSB_ENVFILE_PRESET = 'ambient'
    const file = writeEnvFile('PSB_ENVFILE_PRESET=from-file\nPSB_ENVFILE_NEW=added\n')

    const result = applyEnvFile(file)

    expect(process.env.PSB_ENVFILE_PRESET).toBe('from-file')
    expect(process.env.PSB_ENVFILE_NEW).toBe('added')
    expect(result.names.toSorted()).toEqual(['PSB_ENVFILE_NEW', 'PSB_ENVFILE_PRESET'])
  })

  it('returns variable names only, never values', () => {
    const file = writeEnvFile('PSB_ENVFILE_NEW=secret-value\n')

    const result = applyEnvFile(file)

    expect(result.names).toEqual(['PSB_ENVFILE_NEW'])
    expect(JSON.stringify(result)).not.toContain('secret-value')
  })

  it('throws (fails closed) on a missing file', () => {
    expect(() => applyEnvFile(path.join(tmpdir(), 'psb-missing.env'))).toThrow(/could not read env file/)
  })
})

describe('appendEnvLines', () => {
  const makeDir = useTmpDir('psb-init-env-')
  const envPath = (): string => path.join(makeDir(), '.env')

  const entries: EnvEntry[] = [
    { name: 'BUNNY_STORAGE_API_KEY', value: 'zone-pass' },
    { name: 'BUNNY_STORAGE_HOSTNAME', value: 'my-app.b-cdn.net' },
  ]

  it('creates the file when it is missing', () => {
    const file = envPath()
    const result = appendEnvLines(file, entries)

    expect(result.created).toBe(true)
    expect(result.appended).toEqual(['BUNNY_STORAGE_API_KEY', 'BUNNY_STORAGE_HOSTNAME'])
    expect(result.skipped).toEqual([])
    expect(readFileSync(file, 'utf8')).toBe(
      'BUNNY_STORAGE_API_KEY=zone-pass\nBUNNY_STORAGE_HOSTNAME=my-app.b-cdn.net\n',
    )
  })

  it('appends only missing names to an existing file and preserves a trailing newline', () => {
    const file = envPath()
    writeFileSync(file, 'EXISTING=1\n')

    const result = appendEnvLines(file, entries)

    expect(result.created).toBe(false)
    expect(result.appended).toEqual(['BUNNY_STORAGE_API_KEY', 'BUNNY_STORAGE_HOSTNAME'])
    expect(readFileSync(file, 'utf8')).toBe(
      'EXISTING=1\nBUNNY_STORAGE_API_KEY=zone-pass\nBUNNY_STORAGE_HOSTNAME=my-app.b-cdn.net\n',
    )
  })

  it('adds a separating newline when the existing file has no trailing newline', () => {
    const file = envPath()
    writeFileSync(file, 'EXISTING=1')

    appendEnvLines(file, [{ name: 'NEW_ONE', value: 'x' }])

    expect(readFileSync(file, 'utf8')).toBe('EXISTING=1\nNEW_ONE=x\n')
  })

  it('never overwrites an existing value and reports the collision', () => {
    const file = envPath()
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
    const file = envPath()
    writeFileSync(file, 'BUNNY_STORAGE_API_KEY=a\nBUNNY_STORAGE_HOSTNAME=b\n')

    const result = appendEnvLines(file, entries)

    expect(result.appended).toEqual([])
    expect(result.skipped).toEqual(['BUNNY_STORAGE_API_KEY', 'BUNNY_STORAGE_HOSTNAME'])
    expect(readFileSync(file, 'utf8')).toBe('BUNNY_STORAGE_API_KEY=a\nBUNNY_STORAGE_HOSTNAME=b\n')
  })
})
