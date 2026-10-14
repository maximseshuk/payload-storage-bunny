import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { deployEdgeScriptCommand, reloadNormalizedOptions } from '@/cli/commands/deployEdgeScript.js'
import { createNormalizedOptions } from '@/server/payload/options/normalizer.js'
import { PLUGIN_KEY } from '@/shared/constants.js'

import { useTmpDir } from '../../../helpers/unit/tmpDir.js'

const hoisted = vi.hoisted(() => ({ configPath: '' }))
const consoleSpy = vi.hoisted(() => ({
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
}))

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

describe('reloadNormalizedOptions', () => {
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
    const first = (await reloadNormalizedOptions()) as unknown as { marker: string }
    expect(first.marker).toBe('first')

    process.env.PSB_RELOAD_MARKER = 'second'
    const second = (await reloadNormalizedOptions()) as unknown as { marker: string }
    expect(second.marker).toBe('second')
  })

  it('throws when the reloaded config lacks the plugin key', async () => {
    hoisted.configPath = writeConfig('export default Promise.resolve({ custom: {} })\n')

    await expect(reloadNormalizedOptions()).rejects.toThrow(
      /does not include the @seshuk\/payload-storage-bunny plugin/,
    )
  })
})

const pluginConfig = createNormalizedOptions({
  collections: { media: true },
  storage: {
    apiKey: 'media-key',
    clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'configured' } },
    hostname: 'media.b-cdn.net',
    zoneName: 'media',
  },
} as never)

const runDeploy = async (input: Record<string, unknown>) => {
  consoleSpy.error.mockClear()
  consoleSpy.log.mockClear()
  const exitCode = await deployEdgeScriptCommand.handler({
    args: (await validate(input)) as never,
    getConfig: vi.fn().mockResolvedValue({ custom: { [PLUGIN_KEY]: { config: pluginConfig } } }),
    getPayload: vi.fn(),
    help: {} as never,
    isJSON: false,
  })
  const lines = (spy: typeof consoleSpy.log) => spy.mock.calls.map((call) => String(call[0]))
  return { errors: lines(consoleSpy.error), exitCode, output: lines(consoleSpy.log) }
}

describe('bunny:deploy-edge-script --check', () => {
  afterEach(() => vi.mocked(globalThis.fetch).mockRestore())

  it('reports an unreachable script apart from an outdated one', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))

    const { errors, exitCode, output } = await runDeploy({ check: true })

    expect(exitCode).toBe(1)
    expect(errors.join('\n')).toMatch(/unreachable at https:\/\/uploader\.b-cdn\.net/)
    expect(output.join('\n')).not.toMatch(/Outdated/)
  })

  it('reports an outdated script that answers without a version', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))

    const { exitCode, output } = await runDeploy({ check: true })

    expect(exitCode).toBe(1)
    expect(output.join('\n')).toMatch(/Outdated/)
  })
})
