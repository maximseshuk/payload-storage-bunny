import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildEdgeDeployPlan,
  deployEdgeScript,
  loadZonesFileGroup,
  storageHostFor,
} from '@/cli/lib/deployEdgeScript.js'
import { createNormalizedConfig } from '@/server/payload/config/normalizer.js'

const edge = (secret: string, scriptUrl = 'https://uploader.b-cdn.net') => ({
  edge: { scriptUrl, secret },
})

const jsonResponse = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })

describe('storageHostFor', () => {
  it('uses the regional host when a region is set', () => {
    expect(storageHostFor('ny')).toBe('ny.storage.bunnycdn.com')
  })

  it('falls back to the default host without a region', () => {
    expect(storageHostFor()).toBe('storage.bunnycdn.com')
  })
})

describe('buildEdgeDeployPlan', () => {
  it('builds a single group for a single global non-s3 zone with edge config', () => {
    const config = createNormalizedConfig({
      collections: { media: true },
      storage: {
        apiKey: 'media-key',
        clientUploads: edge('shared'),
        hostname: 'media.b-cdn.net',
        zoneName: 'media',
      },
    } as never)

    const plan = buildEdgeDeployPlan(config)

    expect(plan.errors).toEqual([])
    expect(plan.groups).toHaveLength(1)
    const [group] = plan.groups
    expect(group.zones).toEqual({ media: { accessKey: 'media-key', host: 'storage.bunnycdn.com' } })
    expect(group.sharedSecret).toBe('shared')
    expect(group.scriptUrl).toBe('https://uploader.b-cdn.net')
    expect(group.zoneNames).toEqual(['media'])
  })

  it('enumerates a per-collection non-s3 zone even when the global zone is s3 (CLI gap fix)', () => {
    const config = createNormalizedConfig({
      collections: {
        archives: {
          storage: {
            apiKey: 'archives-key',
            clientUploads: edge('shared'),
            hostname: 'archives.b-cdn.net',
            zoneName: 'archives',
          },
        },
      },
      storage: {
        apiKey: 'media-key',
        clientUploads: {},
        hostname: 'media.b-cdn.net',
        s3: { region: 'de' },
        zoneName: 'media',
      },
    } as never)

    const plan = buildEdgeDeployPlan(config)

    expect(plan.errors).toEqual([])
    expect(plan.groups).toHaveLength(1)
    const [group] = plan.groups
    expect(Object.keys(group.zones)).toEqual(['archives'])
    expect(group.zones.archives).toEqual({ accessKey: 'archives-key', host: 'storage.bunnycdn.com' })
    expect(group.sharedSecret).toBe('shared')
  })

  it('collapses two non-s3 zones sharing a scriptUrl and secret into one group', () => {
    const config = createNormalizedConfig({
      collections: {
        archives: {
          storage: {
            apiKey: 'archives-key',
            clientUploads: edge('shared'),
            hostname: 'archives.b-cdn.net',
            zoneName: 'archives',
          },
        },
      },
      storage: {
        apiKey: 'media-key',
        clientUploads: edge('shared'),
        hostname: 'media.b-cdn.net',
        zoneName: 'media',
      },
    } as never)

    const plan = buildEdgeDeployPlan(config)

    expect(plan.errors).toEqual([])
    expect(plan.groups).toHaveLength(1)
    const [group] = plan.groups
    expect(Object.keys(group.zones).toSorted()).toEqual(['archives', 'media'])
    expect(group.sharedSecret).toBe('shared')
    expect(group.scriptUrl).toBe('https://uploader.b-cdn.net')
  })

  it('splits zones into separate groups by distinct scriptUrl', () => {
    const config = createNormalizedConfig({
      collections: {
        archives: {
          storage: {
            apiKey: 'archives-key',
            clientUploads: edge('secret-b', 'https://b.b-cdn.net'),
            hostname: 'archives.b-cdn.net',
            zoneName: 'archives',
          },
        },
        docs: {
          storage: {
            apiKey: 'docs-key',
            clientUploads: edge('secret-a', 'https://a.b-cdn.net'),
            hostname: 'docs.b-cdn.net',
            zoneName: 'docs',
          },
        },
      },
      storage: {
        apiKey: 'media-key',
        clientUploads: edge('secret-a', 'https://a.b-cdn.net'),
        hostname: 'media.b-cdn.net',
        zoneName: 'media',
      },
    } as never)

    const plan = buildEdgeDeployPlan(config)

    expect(plan.errors).toEqual([])
    expect(plan.groups).toHaveLength(2)

    const groupA = plan.groups.find((g) => g.scriptUrl === 'https://a.b-cdn.net')!
    const groupB = plan.groups.find((g) => g.scriptUrl === 'https://b.b-cdn.net')!
    expect(Object.keys(groupA.zones).toSorted()).toEqual(['docs', 'media'])
    expect(groupA.sharedSecret).toBe('secret-a')
    expect(Object.keys(groupB.zones)).toEqual(['archives'])
    expect(groupB.sharedSecret).toBe('secret-b')
  })

  it('reports a per-group error when two zones in a group configure different secrets', () => {
    const config = createNormalizedConfig({
      collections: {
        archives: {
          storage: {
            apiKey: 'archives-key',
            clientUploads: edge('secret-b'),
            hostname: 'archives.b-cdn.net',
            zoneName: 'archives',
          },
        },
      },
      storage: {
        apiKey: 'media-key',
        clientUploads: edge('secret-a'),
        hostname: 'media.b-cdn.net',
        zoneName: 'media',
      },
    } as never)

    const plan = buildEdgeDeployPlan(config)

    expect(plan.errors.length).toBeGreaterThan(0)
    expect(plan.errors[0]).toContain('different `clientUploads.edge.secret` values')
    expect(plan.groups).toHaveLength(1)
    const [group] = plan.groups
    expect(group.secretConflict).toBe(true)
    expect(group.sharedSecret).toBeUndefined()
  })

  it('derives each zone host from its own region', () => {
    const config = createNormalizedConfig({
      collections: {
        archives: {
          storage: {
            apiKey: 'archives-key',
            clientUploads: edge('shared'),
            hostname: 'archives.b-cdn.net',
            region: 'ny',
            zoneName: 'archives',
          },
        },
      },
      storage: {
        apiKey: 'media-key',
        clientUploads: edge('shared'),
        hostname: 'media.b-cdn.net',
        zoneName: 'media',
      },
    } as never)

    const plan = buildEdgeDeployPlan(config)
    const [group] = plan.groups

    expect(group.zones.archives.host).toBe('ny.storage.bunnycdn.com')
    expect(group.zones.media.host).toBe('storage.bunnycdn.com')
  })

  it('forms a single unassigned bootstrap group when none enables clientUploads', () => {
    const config = createNormalizedConfig({
      collections: { media: true },
      storage: {
        apiKey: 'media-key',
        hostname: 'media.b-cdn.net',
        zoneName: 'media',
      },
    } as never)

    const plan = buildEdgeDeployPlan(config)

    expect(plan.errors).toEqual([])
    expect(plan.groups).toHaveLength(1)
    const [group] = plan.groups
    expect(Object.keys(group.zones)).toEqual(['media'])
    expect(group.sharedSecret).toBeUndefined()
    expect(group.scriptUrl).toBeUndefined()
  })

  it('errors when there are no non-s3 zones to serve', () => {
    const config = createNormalizedConfig({
      collections: { media: true },
      storage: {
        apiKey: 'media-key',
        clientUploads: {},
        hostname: 'media.b-cdn.net',
        s3: { region: 'de' },
        zoneName: 'media',
      },
    } as never)

    const plan = buildEdgeDeployPlan(config)

    expect(plan.errors.length).toBe(1)
    expect(plan.errors[0]).toContain('no non-s3 storage zones are configured')
    expect(plan.groups).toEqual([])
  })
})

describe('loadZonesFileGroup', () => {
  let dir: string

  afterEach(() => {
    if (dir) {
      rmSync(dir, { force: true, recursive: true })
    }
    delete process.env.PSB_ZONES_TEST_KEY
  })

  const writeZonesFile = (value: unknown): string => {
    dir = mkdtempSync(path.join(tmpdir(), 'psb-zones-'))
    const file = path.join(dir, 'zones.json')
    writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value))
    return file
  }

  it('builds a group from inline accessKey + region', () => {
    const file = writeZonesFile({
      archives: { accessKey: 'archives-key', region: 'ny' },
      media: { accessKey: 'media-key' },
    })

    const group = loadZonesFileGroup(file)

    expect(group.zoneNames.toSorted()).toEqual(['archives', 'media'])
    expect(group.zones.archives).toEqual({ accessKey: 'archives-key', host: 'ny.storage.bunnycdn.com' })
    expect(group.zones.media).toEqual({ accessKey: 'media-key', host: 'storage.bunnycdn.com' })
  })

  it('resolves accessKeyEnv indirection from process.env', () => {
    process.env.PSB_ZONES_TEST_KEY = 'from-env'
    const file = writeZonesFile({ media: { accessKeyEnv: 'PSB_ZONES_TEST_KEY' } })

    const group = loadZonesFileGroup(file)

    expect(group.zones.media.accessKey).toBe('from-env')
  })

  it('throws when accessKeyEnv points at an unset variable', () => {
    const file = writeZonesFile({ media: { accessKeyEnv: 'PSB_ZONES_TEST_KEY' } })
    expect(() => loadZonesFileGroup(file)).toThrow(/PSB_ZONES_TEST_KEY/)
  })

  it('throws on a missing file', () => {
    expect(() => loadZonesFileGroup(path.join(tmpdir(), 'psb-does-not-exist.json'))).toThrow(
      /could not read zones file/,
    )
  })

  it('throws on an empty zone set', () => {
    const file = writeZonesFile({})
    expect(() => loadZonesFileGroup(file)).toThrow(/contains no zones/)
  })
})

type SecretCall = { body?: unknown; method: string; url: string }

const nullLogger = { error: () => {}, info: () => {}, warn: () => {} }

const baseDeploy = {
  accountApiKey: 'account-key',
  cdnTier: 'volume' as const,
  code: 'export {}',
  connectionLimit: 10,
  dryRun: false,
  logger: nullLogger,
  name: 'test-script',
  requestLimit: 30,
  sharedSecret: 'the-secret',
  skipHarden: true,
}

const mockSecrets = (existing: Array<{ Id: number; Name: string }>): SecretCall[] => {
  const calls: SecretCall[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : undefined
    const url = request ? request.url : String(input)
    const method = request ? request.method : (init?.method ?? 'GET')
    const rawBody = request ? await request.text() : (init?.body as string | undefined)
    const body = rawBody ? JSON.parse(rawBody) : undefined
    calls.push({ body, method, url })

    if (url.includes('/compute/script?')) {
      return jsonResponse({
        Items: [{ Id: 7, LinkedPullZones: [{ DefaultHostname: 'uploader.b-cdn.net', Id: 3 }], Name: 'test-script' }],
      })
    }
    if (url.endsWith('/compute/script/7/secrets') && method === 'GET') {
      return jsonResponse({ Secrets: existing })
    }
    return jsonResponse({})
  })
  return calls
}

const postedSecrets = (calls: SecretCall[]): Map<string, string> =>
  new Map(
    calls
      .filter((c) => c.url.includes('/secrets') && c.method === 'POST')
      .map((c) => [(c.body as { Name: string }).Name, (c.body as { Secret: string }).Secret]),
  )

const deletedUrls = (calls: SecretCall[]): string[] => calls.filter((c) => c.method === 'DELETE').map((c) => c.url)

describe('deployEdgeScript secrets', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes SHARED_SECRET + per-zone ZONE_* secrets', async () => {
    const calls = mockSecrets([])

    const zones = { media: { accessKey: 'media-key', host: 'storage.bunnycdn.com' } }
    await deployEdgeScript({ ...baseDeploy, zones })

    const written = postedSecrets(calls)
    expect(written.get('SHARED_SECRET')).toBe('the-secret')
    expect(JSON.parse(written.get('ZONE_MEDIA') as string)).toEqual({
      accessKey: 'media-key',
      host: 'storage.bunnycdn.com',
    })
  })

  it('reconcile-prunes ZONE_* secrets no longer in config, leaving shared/user secrets untouched', async () => {
    const calls = mockSecrets([
      { Id: 10, Name: 'ZONE_MEDIA' },
      { Id: 11, Name: 'ZONE_OLD' },
      { Id: 12, Name: 'SHARED_SECRET' },
      { Id: 13, Name: 'ALLOWED_ORIGINS' },
      { Id: 14, Name: 'USER_CUSTOM' },
    ])

    await deployEdgeScript({
      ...baseDeploy,
      zones: { media: { accessKey: 'media-key', host: 'storage.bunnycdn.com' } },
    })

    const deletes = deletedUrls(calls)
    expect(deletes).toContain('https://api.bunny.net/compute/script/7/secrets/11')
    expect(deletes).not.toContain('https://api.bunny.net/compute/script/7/secrets/12')
    expect(deletes).not.toContain('https://api.bunny.net/compute/script/7/secrets/13')
    expect(deletes).not.toContain('https://api.bunny.net/compute/script/7/secrets/14')

    const zoneMediaPost = calls.find(
      (c) => c.method === 'POST' && (c.body as { Name?: string } | undefined)?.Name === 'ZONE_MEDIA',
    )
    expect(zoneMediaPost?.url).toBe('https://api.bunny.net/compute/script/7/secrets/10')
  })

  it('does not prune ZONE_* secrets in additive mode', async () => {
    const calls = mockSecrets([{ Id: 11, Name: 'ZONE_OLD' }])

    await deployEdgeScript({
      ...baseDeploy,
      additive: true,
      zones: { media: { accessKey: 'media-key', host: 'storage.bunnycdn.com' } },
    })

    const deletes = deletedUrls(calls)
    expect(deletes).not.toContain('https://api.bunny.net/compute/script/7/secrets/11')
  })

  it('omits the SHARED_SECRET write when writeSharedSecret is false', async () => {
    const calls = mockSecrets([])

    await deployEdgeScript({
      ...baseDeploy,
      writeSharedSecret: false,
      zones: { media: { accessKey: 'media-key', host: 'storage.bunnycdn.com' } },
    })

    const written = postedSecrets(calls)
    expect(written.has('SHARED_SECRET')).toBe(false)
    expect(written.has('ZONE_MEDIA')).toBe(true)
  })

  it('prunes only after the script is published', async () => {
    const calls = mockSecrets([{ Id: 11, Name: 'ZONE_OLD' }])

    await deployEdgeScript({
      ...baseDeploy,
      zones: { media: { accessKey: 'media-key', host: 'storage.bunnycdn.com' } },
    })

    const publishIndex = calls.findIndex((c) => c.url.endsWith('/publish') && c.method === 'POST')
    const firstDeleteIndex = calls.findIndex((c) => c.method === 'DELETE')
    expect(publishIndex).toBeGreaterThanOrEqual(0)
    expect(firstDeleteIndex).toBeGreaterThan(publishIndex)
  })
})
