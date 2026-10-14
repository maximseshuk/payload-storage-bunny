import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { deployEdgeScriptCommand, reloadNormalizedOptions } from '@/cli/commands/deployEdgeScript.js'
import { createNormalizedOptions } from '@/server/payload/options/normalizer.js'
import { PLUGIN_KEY } from '@/shared/constants.js'

import { type FetchCall, jsonResponse, spyFetch } from '../../../helpers/unit/fetchMock.js'
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

const mockBunny = (script: { secrets: string[] } | undefined): FetchCall[] =>
  spyFetch(({ method, pathname }) => {
    if (pathname === '/compute/script' && method === 'GET') {
      return jsonResponse({ Items: script ? [{ Id: 7, Name: 'payload-storage-bunny-uploader' }] : [] })
    }
    if (pathname === '/compute/script' && method === 'POST') {
      return jsonResponse({ Id: 7, Name: 'payload-storage-bunny-uploader' })
    }
    if (pathname === '/compute/script/7/secrets' && method === 'GET') {
      return jsonResponse({ Secrets: (script?.secrets ?? []).map((Name, i) => ({ Id: i + 1, Name })) })
    }
    if (pathname === '/compute/script/7') {
      return jsonResponse({ Id: 7, LinkedPullZones: [{ DefaultHostname: 'uploader.b-cdn.net', Id: 3 }] })
    }
    return jsonResponse({})
  })

const sharedSecretPost = (calls: FetchCall[]) =>
  calls.find((c) => c.method === 'POST' && c.body?.Name === 'SHARED_SECRET')?.body?.Secret as string | undefined

const makeZonesDir = useTmpDir('psb-deploy-zones-')
const writeZonesFile = (): string => {
  const file = path.join(makeZonesDir(), 'zones.json')
  writeFileSync(file, JSON.stringify({ media: { accessKey: 'media-key' } }))
  return file
}

describe('bunny:deploy-edge-script --zones-file', () => {
  afterEach(() => vi.mocked(globalThis.fetch).mockRestore())

  it('keeps the SHARED_SECRET of an existing script without --secret', async () => {
    const calls = mockBunny({ secrets: ['SHARED_SECRET', 'ZONE_MEDIA'] })

    const { exitCode, output } = await runDeploy({
      apiKey: 'account-key',
      skipHarden: true,
      zonesFile: writeZonesFile(),
    })

    expect(exitCode).toBeUndefined()
    expect(sharedSecretPost(calls)).toBeUndefined()
    expect(output.join('\n')).toMatch(/kept the script's existing SHARED_SECRET/)
    expect(output.join('\n')).not.toMatch(/[0-9a-f]{32}/)
  })

  it('writes and prints a new secret for a new script', async () => {
    const calls = mockBunny(undefined)

    const { output } = await runDeploy({ apiKey: 'account-key', skipHarden: true, zonesFile: writeZonesFile() })

    const secret = sharedSecretPost(calls)
    expect(secret).toMatch(/^[0-9a-f]{32}$/)
    expect(output.join('\n')).toContain(secret)
  })

  it('writes the --secret value to an existing script without printing it', async () => {
    const calls = mockBunny({ secrets: ['SHARED_SECRET'] })

    const { output } = await runDeploy({
      apiKey: 'account-key',
      secret: 'rotated',
      skipHarden: true,
      zonesFile: writeZonesFile(),
    })

    expect(sharedSecretPost(calls)).toBe('rotated')
    expect(output.join('\n')).not.toContain('rotated')
    expect(output.join('\n')).toContain('<the --secret value>')
  })
})

describe('bunny:deploy-edge-script secret output', () => {
  afterEach(() => vi.mocked(globalThis.fetch).mockRestore())

  it('does not print the secret it took from the config', async () => {
    const calls = mockBunny({ secrets: ['SHARED_SECRET'] })

    const { output } = await runDeploy({ apiKey: 'account-key', skipHarden: true })

    expect(sharedSecretPost(calls)).toBe('configured')
    expect(output.join('\n')).not.toContain("'configured'")
    expect(output.join('\n')).toContain('<your existing edge.secret>')
  })

  it('hides a generated secret with --no-print-secret', async () => {
    mockBunny(undefined)
    const { output } = await runDeploy({
      apiKey: 'account-key',
      printSecret: false,
      skipHarden: true,
      zonesFile: writeZonesFile(),
    })

    expect(output.join('\n')).toContain('<hidden — --no-print-secret>')
    expect(output.join('\n')).not.toMatch(/[0-9a-f]{32}/)
  })
})
