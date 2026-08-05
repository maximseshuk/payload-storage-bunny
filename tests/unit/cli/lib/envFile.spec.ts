import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { reloadNormalizedConfig } from '@/cli/commands/deployEdgeScript.js'
import { applyEnvFile } from '@/cli/lib/envFile.js'

describe('applyEnvFile', () => {
  let dir: string

  afterEach(() => {
    if (dir) {
      rmSync(dir, { force: true, recursive: true })
    }
    delete process.env.PSB_ENVFILE_PRESET
    delete process.env.PSB_ENVFILE_NEW
  })

  const writeEnvFile = (contents: string): string => {
    dir = mkdtempSync(path.join(tmpdir(), 'psb-env-'))
    const file = path.join(dir, '.env.test')
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

const hoisted = vi.hoisted(() => ({ configPath: '' }))

vi.mock('payload/node', () => ({
  findConfig: () => hoisted.configPath,
}))

describe('reloadNormalizedConfig', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'psb-reload-'))
    hoisted.configPath = path.join(dir, 'payload.config.mjs')
    writeFileSync(
      hoisted.configPath,
      [
        'export default Promise.resolve({',
        "  custom: { '@seshuk/payload-storage-bunny': { config: { marker: process.env.PSB_RELOAD_MARKER } } },",
        '})',
        '',
      ].join('\n'),
    )
  })

  afterAll(() => {
    rmSync(dir, { force: true, recursive: true })
    delete process.env.PSB_RELOAD_MARKER
  })

  it('cache-busts the config re-import so changed env is picked up between calls', async () => {
    process.env.PSB_RELOAD_MARKER = 'first'
    const first = (await reloadNormalizedConfig()) as unknown as { marker: string }
    expect(first.marker).toBe('first')

    process.env.PSB_RELOAD_MARKER = 'second'
    const second = (await reloadNormalizedConfig()) as unknown as { marker: string }
    expect(second.marker).toBe('second')
  })

  it('throws when the reloaded config lacks the plugin key', async () => {
    const missingDir = mkdtempSync(path.join(tmpdir(), 'psb-reload-missing-'))
    const missingPath = path.join(missingDir, 'payload.config.mjs')
    writeFileSync(missingPath, 'export default Promise.resolve({ custom: {} })\n')
    hoisted.configPath = missingPath

    await expect(reloadNormalizedConfig()).rejects.toThrow(/does not include the @seshuk\/payload-storage-bunny plugin/)

    hoisted.configPath = path.join(dir, 'payload.config.mjs')
    rmSync(missingDir, { force: true, recursive: true })
  })
})
