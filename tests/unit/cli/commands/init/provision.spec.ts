import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildInitPlan } from '@/cli/lib/plan.js'
import type { Ledger, NameCheck } from '@/cli/lib/provision.js'
import {
  checkLibraryName,
  checkStorageName,
  createLedger,
  provisionInit,
  resolveAvailableName,
} from '@/cli/lib/provision.js'

type Call = { body?: Record<string, unknown>; method: string; pathname: string }

type PullZone = {
  Hostnames: Array<{ Value: string }>
  Id: number
  Name: string
  OptimizerEnabled?: boolean
  OriginType?: number
  StorageZoneId?: number
  ZoneSecurityEnabled: boolean
  ZoneSecurityKey?: string
}

type MockState = {
  computeScript?: { Id: number; Name: string }
  libraries?: Array<{ ApiKey: string; Id: number; Name: string; PullZoneId?: number }>
  pullZones: Record<number, PullZone>
  rejectPathname?: string
  scriptSecrets?: Array<{ Id: number; Name: string }>
  storageAvailable?: boolean
  storageZones?: Array<{ Id: number; Name: string; Password: string }>
}

const jsonResponse = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })

const nextPullZoneId = { value: 900 }

const installFetch = (state: MockState): Call[] => {
  const calls: Call[] = []
  nextPullZoneId.value = 900

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : undefined
    const url = new URL(request ? request.url : String(input))
    const { pathname } = url
    const method = request ? request.method : (init?.method ?? 'GET')
    const rawBody = request ? await request.text() : (init?.body as string | undefined)
    const body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : undefined
    calls.push({ body, method, pathname })

    if (state.rejectPathname && pathname === state.rejectPathname && method === 'POST') {
      return new Response('boom', { status: 500 })
    }

    if (pathname === '/storagezone' && method === 'GET') {
      return jsonResponse({ Items: state.storageZones ?? [] })
    }
    if (pathname === '/storagezone/checkavailability' && method === 'POST') {
      return jsonResponse({ Available: state.storageAvailable ?? true })
    }
    if (pathname === '/storagezone' && method === 'POST') {
      const created = { Id: 100, Name: String(body?.Name), Password: 'zone-pass' }
      state.storageZones = [...(state.storageZones ?? []), created]
      return jsonResponse(created)
    }

    if (pathname === '/pullzone' && method === 'GET') {
      return jsonResponse({ Items: Object.values(state.pullZones) })
    }
    if (pathname === '/pullzone' && method === 'POST') {
      const id = (nextPullZoneId.value += 1)
      const secure = body?.ZoneSecurityEnabled === true
      state.pullZones[id] = {
        Hostnames: [{ Value: `${String(body?.Name)}.b-cdn.net` }],
        Id: id,
        Name: String(body?.Name),
        OriginType: body?.OriginType as number,
        StorageZoneId: body?.StorageZoneId as number,
        ZoneSecurityEnabled: secure,
        ZoneSecurityKey: secure ? 'storage-token' : undefined,
      }
      return jsonResponse(state.pullZones[id])
    }

    const pullMatch = /^\/pullzone\/(\d+)$/.exec(pathname)
    if (pullMatch) {
      const id = Number(pullMatch[1])
      const zone =
        state.pullZones[id] ??
        ({ Hostnames: [], Id: id, Name: `pz-${id}`, ZoneSecurityEnabled: false } satisfies PullZone)
      if (method === 'POST') {
        if (body?.ZoneSecurityEnabled === true) {
          zone.ZoneSecurityEnabled = true
          zone.ZoneSecurityKey = zone.Name.includes('stream') ? 'stream-token' : 'storage-token'
        }
        if (body?.OptimizerEnabled === true) {
          zone.OptimizerEnabled = true
        }
        return jsonResponse(zone)
      }
      return jsonResponse(zone)
    }

    if (pathname === '/videolibrary' && method === 'GET') {
      return jsonResponse({ Items: state.libraries ?? [] })
    }
    if (pathname === '/videolibrary' && method === 'POST') {
      const pzId = (nextPullZoneId.value += 1)
      state.pullZones[pzId] = {
        Hostnames: [{ Value: `vz-${String(body?.Name)}.b-cdn.net` }],
        Id: pzId,
        Name: `${String(body?.Name)}-stream-pz`,
        ZoneSecurityEnabled: false,
      }
      const created = { ApiKey: 'lib-key', Id: 300, Name: String(body?.Name), PullZoneId: pzId }
      state.libraries = [...(state.libraries ?? []), created]
      return jsonResponse(created)
    }

    const libMatch = /^\/videolibrary\/(\d+)$/.exec(pathname)
    if (libMatch) {
      return jsonResponse({})
    }

    if (pathname === '/compute/script' && method === 'GET') {
      return jsonResponse({
        Items: state.computeScript
          ? [
              {
                Id: state.computeScript.Id,
                LinkedPullZones: [{ DefaultHostname: 'uploader.b-cdn.net', Id: 601 }],
                Name: state.computeScript.Name,
              },
            ]
          : [],
      })
    }
    if (pathname === '/compute/script' && method === 'POST') {
      return jsonResponse({
        Id: 501,
        LinkedPullZones: [{ DefaultHostname: 'uploader.b-cdn.net', Id: 601 }],
        Name: String(body?.Name),
      })
    }
    if (/^\/compute\/script\/\d+\/secrets$/.test(pathname) && method === 'GET') {
      return jsonResponse({ Secrets: state.scriptSecrets ?? [] })
    }

    return jsonResponse({})
  })

  return calls
}

const runProvision = async (
  plan: ReturnType<typeof buildInitPlan>,
  ledger: Ledger = createLedger(),
  edge?: { reuseScript: boolean; sharedSecret?: string },
): ReturnType<typeof provisionInit> =>
  provisionInit({
    accountApiKey: 'account-key',
    edge,
    ledger,
    logger: { error: () => {}, info: () => {}, warn: () => {} },
    plan,
  })

const reusableStorage = (): MockState => ({
  pullZones: {
    888: {
      Hostnames: [{ Value: 'my-app.b-cdn.net' }],
      Id: 888,
      Name: 'my-app',
      OriginType: 2,
      StorageZoneId: 42,
      ZoneSecurityEnabled: false,
    },
  },
  storageZones: [{ Id: 42, Name: 'my-app', Password: 'existing-pass' }],
})

const answers = (overrides = {}) => ({
  clientUploads: false,
  collectionSlug: 'media',
  deployEdge: false,
  optimizer: false,
  purge: false,
  region: 'de',
  service: 'both' as const,
  signedUrls: false,
  storageAccess: 'http' as const,
  storageReplication: [] as string[],
  storageTier: 'standard' as const,
  storageZoneName: 'my-app',
  streamReplication: [] as string[],
  videoLibraryName: 'my-app-stream',
  ...overrides,
})

describe('provisionInit — create path', () => {
  afterEach(() => vi.restoreAllMocks())

  it('creates storage + pull + library with the documented request bodies (S3 + signed)', async () => {
    const calls = installFetch({ pullZones: {} })
    const plan = buildInitPlan(answers({ signedUrls: true, storageAccess: 's3' }))

    const result = await runProvision(plan)

    const storagePost = calls.find((c) => c.pathname === '/storagezone' && c.method === 'POST')
    expect(storagePost?.body).toEqual({ Name: 'my-app', Region: 'DE', StorageZoneType: 1 })

    const pullPost = calls.find((c) => c.pathname === '/pullzone' && c.method === 'POST')
    expect(pullPost?.body).toEqual({
      EnableTLS1: false,
      EnableTLS1_1: false,
      ErrorPageWhitelabel: true,
      IgnoreQueryStrings: true,
      Name: 'my-app',
      OriginType: 2,
      StorageZoneId: 100,
      Type: 0,
      UseStaleWhileOffline: true,
      ZoneSecurityEnabled: true,
    })
    expect(pullPost?.body).not.toHaveProperty('UseStaleWhileUpdating')
    expect(pullPost?.body).not.toHaveProperty('OptimizerEnabled')

    const libPost = calls.find((c) => c.pathname === '/videolibrary' && c.method === 'POST')
    expect(libPost?.body).toEqual({ Name: 'my-app-stream' })
    expect(libPost?.body).not.toHaveProperty('Region')

    expect(calls.some((c) => /^\/videolibrary\/\d+$/.test(c.pathname) && c.method === 'POST')).toBe(false)

    expect(result.storage).toMatchObject({
      apiKey: 'zone-pass',
      hostname: 'my-app.b-cdn.net',
      region: 'de',
      tokenSecurityKey: 'storage-token',
      zoneName: 'my-app',
    })
    expect(result.stream).toMatchObject({
      apiKey: 'lib-key',
      libraryId: 300,
      tokenSecurityKey: 'stream-token',
    })
    expect(result.stream?.hostname).toMatch(/\.b-cdn\.net$/)

    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('omits StorageZoneType and security when client uploads and signed URLs are off', async () => {
    const calls = installFetch({ pullZones: {} })
    const plan = buildInitPlan(answers({ service: 'storage' }))

    await runProvision(plan)

    const storagePost = calls.find((c) => c.pathname === '/storagezone' && c.method === 'POST')
    expect(storagePost?.body).toEqual({ Name: 'my-app', Region: 'DE' })
    const pullPost = calls.find((c) => c.pathname === '/pullzone' && c.method === 'POST')
    expect(pullPost?.body).toMatchObject({ ZoneSecurityEnabled: false })
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('sends ZoneTier 1 and forces Region DE for the Edge (SSD) tier, ignoring the selected region', async () => {
    const calls = installFetch({ pullZones: {} })
    const plan = buildInitPlan(answers({ region: 'uk', service: 'storage', storageTier: 'edge' }))

    await runProvision(plan)

    const storagePost = calls.find((c) => c.pathname === '/storagezone' && c.method === 'POST')
    expect(storagePost?.body).toEqual({ Name: 'my-app', Region: 'DE', ZoneTier: 1 })
  })

  it('sends uppercased ReplicationRegions for storage and stream when chosen', async () => {
    const calls = installFetch({ pullZones: {} })
    const plan = buildInitPlan(answers({ storageReplication: ['uk', 'se'], streamReplication: ['la'] }))

    await runProvision(plan)

    const storagePost = calls.find((c) => c.pathname === '/storagezone' && c.method === 'POST')
    expect(storagePost?.body).toMatchObject({ ReplicationRegions: ['UK', 'SE'] })
    const libPost = calls.find((c) => c.pathname === '/videolibrary' && c.method === 'POST')
    expect(libPost?.body).toEqual({ Name: 'my-app-stream', ReplicationRegions: ['LA'] })
    expect(libPost?.body).not.toHaveProperty('Region')
  })

  it('deploys the Edge Script for an HTTP zone with client uploads and returns its url + secret', async () => {
    const calls = installFetch({ pullZones: {} })
    const plan = buildInitPlan(
      answers({ clientUploads: true, deployEdge: true, service: 'storage', storageAccess: 'http' }),
    )

    const result = await runProvision(plan)

    expect(calls.some((c) => c.pathname === '/compute/script' && c.method === 'POST')).toBe(true)
    expect(result.storage?.edge?.scriptUrl).toBe('https://uploader.b-cdn.net')
    expect(result.storage?.edge?.secret).toMatch(/^[0-9a-f]{32}$/)

    const secretPosts = calls.filter((c) => /\/secrets(\/\d+)?$/.test(c.pathname) && c.method === 'POST')
    const written = new Map(
      secretPosts.map((c) => [String(c.body?.Name), String((c.body as { Secret?: unknown } | undefined)?.Secret)]),
    )
    expect(written.get('SHARED_SECRET')).toBe(result.storage?.edge?.secret)
    expect(JSON.parse(written.get('ZONE_MY_APP') as string)).toMatchObject({ accessKey: 'zone-pass' })
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('adds the Optimizer fields to the create body when optimizer is enabled', async () => {
    const calls = installFetch({ pullZones: {} })
    const plan = buildInitPlan(answers({ optimizer: true, service: 'storage' }))

    await runProvision(plan)

    const pullPost = calls.find((c) => c.pathname === '/pullzone' && c.method === 'POST')
    expect(pullPost?.body).toMatchObject({
      OptimizerAutomaticOptimizationEnabled: true,
      OptimizerEnableManipulationEngine: true,
      OptimizerEnableWebP: true,
      OptimizerEnabled: true,
      OptimizerMinifyCSS: false,
      OptimizerMinifyJavaScript: false,
    })
    expect(calls.some((c) => /^\/pullzone\/\d+$/.test(c.pathname) && c.method === 'POST')).toBe(false)
  })
})

describe('provisionInit — edge reuse path', () => {
  afterEach(() => vi.restoreAllMocks())

  const edgeAnswers = answers({ clientUploads: true, deployEdge: true, service: 'storage', storageAccess: 'http' })

  it('adds its own zone without rotating SHARED_SECRET or pruning other zones', async () => {
    const calls = installFetch({
      computeScript: { Id: 777, Name: 'payload-storage-bunny-uploader' },
      pullZones: {},
      scriptSecrets: [
        { Id: 1, Name: 'SHARED_SECRET' },
        { Id: 2, Name: 'ZONE_OTHER' },
      ],
    })

    const result = await runProvision(buildInitPlan(edgeAnswers), createLedger(), {
      reuseScript: true,
      sharedSecret: 'existing-shared-secret',
    })

    const secretPosts = calls.filter((c) => /\/secrets(\/\d+)?$/.test(c.pathname) && c.method === 'POST')
    const writtenNames = secretPosts.map((c) => String(c.body?.Name))
    expect(writtenNames).not.toContain('SHARED_SECRET')
    expect(writtenNames.filter((n) => n.startsWith('ZONE_'))).toEqual(['ZONE_MY_APP'])

    expect(calls.some((c) => c.method === 'DELETE' && c.pathname.endsWith('/secrets/2'))).toBe(false)

    expect(calls.some((c) => c.pathname === '/compute/script' && c.method === 'POST')).toBe(false)
    expect(result.storage?.edge?.secret).toBe('existing-shared-secret')
    expect(result.storage?.edge?.secretKnown).toBe(true)
  })

  it('marks the secret unknown when reusing a script without a provided secret', async () => {
    installFetch({
      computeScript: { Id: 777, Name: 'payload-storage-bunny-uploader' },
      pullZones: {},
      scriptSecrets: [{ Id: 1, Name: 'SHARED_SECRET' }],
    })

    const result = await runProvision(buildInitPlan(edgeAnswers), createLedger(), { reuseScript: true })

    expect(result.storage?.edge?.secretKnown).toBe(false)
  })
})

describe('provisionInit — reuse path', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reuses existing resources and issues no create POST', async () => {
    const calls = installFetch({
      libraries: [{ ApiKey: 'existing-lib', Id: 555, Name: 'my-app-stream', PullZoneId: 777 }],
      pullZones: {
        777: {
          Hostnames: [{ Value: 'vz-x.b-cdn.net' }],
          Id: 777,
          Name: 'my-app-stream-pz',
          ZoneSecurityEnabled: false,
        },
        888: {
          Hostnames: [{ Value: 'my-app.b-cdn.net' }],
          Id: 888,
          Name: 'my-app',
          OriginType: 2,
          StorageZoneId: 42,
          ZoneSecurityEnabled: false,
        },
      },
      storageZones: [{ Id: 42, Name: 'my-app', Password: 'existing-pass' }],
    })

    const ledger = createLedger()
    const result = await runProvision(buildInitPlan(answers()), ledger)

    expect(calls.some((c) => c.pathname === '/storagezone' && c.method === 'POST')).toBe(false)
    expect(calls.some((c) => c.pathname === '/pullzone' && c.method === 'POST')).toBe(false)
    expect(calls.some((c) => c.pathname === '/videolibrary' && c.method === 'POST')).toBe(false)
    expect(calls.some((c) => c.pathname === '/storagezone/checkavailability')).toBe(false)

    expect(result.storage?.apiKey).toBe('existing-pass')
    expect(result.stream?.apiKey).toBe('existing-lib')
    expect(ledger.reused.map((e) => e.kind).toSorted()).toEqual(['pull zone', 'storage zone', 'video library'])
    expect(ledger.created).toEqual([])
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('enables the Optimizer on a reused pull zone via POST /pullzone/{id}', async () => {
    const calls = installFetch(reusableStorage())
    const plan = buildInitPlan(answers({ optimizer: true, service: 'storage' }))

    await runProvision(plan)

    const optimizerPost = calls.find((c) => c.pathname === '/pullzone/888' && c.method === 'POST')
    expect(optimizerPost?.body).toMatchObject({ OptimizerEnabled: true, OptimizerMinifyCSS: false })
    expect(calls.some((c) => c.pathname === '/pullzone' && c.method === 'POST')).toBe(false)
  })

  it('does not touch a reused pull zone when the optimizer is not requested', async () => {
    const calls = installFetch(reusableStorage())
    const plan = buildInitPlan(answers({ optimizer: false, service: 'storage' }))

    await runProvision(plan)

    expect(calls.some((c) => /^\/pullzone\/\d+$/.test(c.pathname) && c.method === 'POST')).toBe(false)
  })
})

describe('provisionInit — conflicts and failures', () => {
  afterEach(() => vi.restoreAllMocks())

  it('throws when the storage zone name is taken by another account', async () => {
    installFetch({ pullZones: {}, storageAvailable: false })
    await expect(runProvision(buildInitPlan(answers({ service: 'storage' })))).rejects.toThrow(/already taken/)
  })

  it('propagates a mid-run error and preserves the created-so-far ledger', async () => {
    installFetch({ pullZones: {}, rejectPathname: '/pullzone' })
    const ledger = createLedger()

    await expect(runProvision(buildInitPlan(answers({ service: 'storage' })), ledger)).rejects.toThrow(/Bunny API/)

    expect(ledger.created).toEqual([{ id: 100, kind: 'storage zone', name: 'my-app' }])
  })
})

describe('resolveAvailableName', () => {
  it('returns the first name when it is available, without re-prompting', async () => {
    const reprompt = vi.fn()
    const result = await resolveAvailableName(
      'media',
      async () => ({ status: 'available' }) satisfies NameCheck,
      reprompt,
    )
    expect(result).toEqual({ name: 'media', reuse: false })
    expect(reprompt).not.toHaveBeenCalled()
  })

  it('flags reuse when the name already belongs to the account', async () => {
    const result = await resolveAvailableName('media', async () => ({ status: 'reuse' }), vi.fn())
    expect(result).toEqual({ name: 'media', reuse: true })
  })

  it('re-prompts with the detail until a usable name is given', async () => {
    const checks: NameCheck[] = [{ detail: 'taken globally', status: 'taken' }, { status: 'available' }]
    const check = vi.fn(async () => checks.shift() as NameCheck)
    const reprompt = vi.fn(async () => 'my-app')

    const result = await resolveAvailableName('media', check, reprompt)

    expect(result).toEqual({ name: 'my-app', reuse: false })
    expect(reprompt).toHaveBeenCalledWith('taken globally')
    expect(check).toHaveBeenCalledTimes(2)
  })
})

describe('checkStorageName', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reports available for a free name', async () => {
    installFetch({ pullZones: {} })
    expect(await checkStorageName('key', 'brand-new')).toEqual({ status: 'available' })
  })

  it('reports reuse when the account already owns the zone', async () => {
    installFetch({ pullZones: {}, storageZones: [{ Id: 42, Name: 'media', Password: 'p' }] })
    expect(await checkStorageName('key', 'media')).toEqual({ status: 'reuse' })
  })

  it('reports taken when the global name check fails', async () => {
    installFetch({ pullZones: {}, storageAvailable: false })
    const result = await checkStorageName('key', 'media')
    expect(result.status).toBe('taken')
    expect(result.detail).toMatch(/taken globally/)
  })

  it('reports taken when an unrelated pull zone owns the name', async () => {
    installFetch({
      pullZones: {
        7: { Hostnames: [], Id: 7, Name: 'media', OriginType: 0, ZoneSecurityEnabled: false },
      },
    })
    const result = await checkStorageName('key', 'media')
    expect(result.status).toBe('taken')
    expect(result.detail).toMatch(/pull zone/)
  })
})

describe('checkLibraryName', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns reuse when the library exists and available otherwise', async () => {
    installFetch({ libraries: [{ ApiKey: 'k', Id: 9, Name: 'my-app-stream' }], pullZones: {} })
    expect(await checkLibraryName('key', 'my-app-stream')).toBe('reuse')
    expect(await checkLibraryName('key', 'other')).toBe('available')
  })
})
