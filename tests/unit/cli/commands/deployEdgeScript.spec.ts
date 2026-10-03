import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, describe, expect, it, vi } from 'vitest'

import { deployEdgeScriptCommand, reloadNormalizedConfig } from '@/cli/commands/deployEdgeScript.js'

import { useTmpDir } from '../../../helpers/unit/tmpDir.js'

const hoisted = vi.hoisted(() => ({ configPath: '' }))

vi.mock('payload/node', () => ({
  findConfig: () => hoisted.configPath,
}))

const INPUTS = [
  'apiKey',
  'envFile',
  'zonesFile',
  'secret',
  'scriptUrl',
  'name',
  'cdnTier',
  'allowedOrigins',
  'connectionLimit',
  'requestLimit',
  'check',
  'new',
  'dryRun',
  'printSecret',
  'prune',
  'skipHarden',
]

const validate = async (input: Record<string, unknown>) => {
  const result = await deployEdgeScriptCommand.input['~standard'].validate(input)
  if (result.issues) {
    throw new Error(result.issues.map((issue) => issue.message).join('\n'))
  }
  return result.value as Record<string, unknown>
}

describe('bunny:deploy-edge-script input', () => {
  it('declares every flag', () => {
    const properties = deployEdgeScriptCommand.schema.properties as Record<string, unknown>
    expect(Object.keys(properties).toSorted()).toEqual(INPUTS.toSorted())
  })

  it('accepts value, negatable, and boolean flags and defaults the negatable ones to enabled', async () => {
    const args = await validate({ check: true, connectionLimit: 20, name: 'custom', printSecret: false, prune: false })

    expect(args).toMatchObject({ check: true, connectionLimit: 20, name: 'custom', printSecret: false, prune: false })
    expect(await validate({})).toMatchObject({ printSecret: true, prune: true })
  })

  it('rejects unknown flags', async () => {
    await expect(validate({ unknown: true })).rejects.toThrow(/Invalid input/)
  })
})

describe('reloadNormalizedConfig', () => {
  const makeDir = useTmpDir('psb-reload-')
  const writeConfig = (contents: string): string => {
    const file = path.join(makeDir(), 'payload.config.mjs')
    writeFileSync(file, contents)
    return file
  }

  afterAll(() => {
    delete process.env.PSB_RELOAD_MARKER
  })

  it('re-imports the config on each call so it picks up env changes', async () => {
    hoisted.configPath = writeConfig(
      [
        'export default Promise.resolve({',
        "  custom: { '@seshuk/payload-storage-bunny': { config: { marker: process.env.PSB_RELOAD_MARKER } } },",
        '})',
        '',
      ].join('\n'),
    )

    process.env.PSB_RELOAD_MARKER = 'first'
    const first = (await reloadNormalizedConfig()) as unknown as { marker: string }
    expect(first.marker).toBe('first')

    process.env.PSB_RELOAD_MARKER = 'second'
    const second = (await reloadNormalizedConfig()) as unknown as { marker: string }
    expect(second.marker).toBe('second')
  })

  it('throws when the reloaded config lacks the plugin key', async () => {
    hoisted.configPath = writeConfig('export default Promise.resolve({ custom: {} })\n')

    await expect(reloadNormalizedConfig()).rejects.toThrow(/does not include the @seshuk\/payload-storage-bunny plugin/)
  })
})
