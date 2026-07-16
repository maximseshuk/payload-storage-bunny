import { readFileSync } from 'node:fs'
import nodePath from 'node:path'

import { collectStorageConfigs } from '@/config/inspect.js'
import type { NormalizedBunnyStorageConfig } from '@/types/configNormalized.js'

const BUNNY_API_BASE = 'https://api.bunny.net'

const STALE_ZONE_SECRETS = ['STORAGE_HOST', 'STORAGE_ZONE', 'STORAGE_ACCESS_KEY']

export type DeployLogger = {
  error: (message: string) => void
  info: (message: string) => void
  warn: (message: string) => void
}

export type DeployEdgeScriptOptions = {
  accountApiKey: string
  allowedOrigins?: string
  cdnTier: 'standard' | 'volume'
  code: string
  connectionLimit: number
  dryRun: boolean
  logger: DeployLogger
  name: string
  requestLimit: number
  sharedSecret: string
  skipHarden: boolean
  zones: Record<string, { accessKey: string; host: string }>
}

export const storageHostFor = (region?: string): string =>
  region ? `${region}.storage.bunnycdn.com` : 'storage.bunnycdn.com'

export type EdgeDeployGroup = {
  scriptUrl?: string
  secretConflict?: boolean
  sharedSecret?: string
  zoneNames: string[]
  zones: Record<string, { accessKey: string; host: string }>
}

export type EdgeDeployPlan = {
  errors: string[]
  groups: EdgeDeployGroup[]
}

export const buildEdgeDeployPlan = (config: NormalizedBunnyStorageConfig): EdgeDeployPlan => {
  const errors: string[] = []
  const all = collectStorageConfigs(config).filter((s) => !s.s3)

  if (all.length === 0) {
    return {
      errors: [
        'no non-s3 storage zones are configured; the Edge Script only serves non-s3 zones (S3-enabled zones presign uploads directly)',
      ],
      groups: [],
    }
  }

  const withUploads = all.filter((s) => s.clientUploads)
  const targets = withUploads.length > 0 ? withUploads : all

  const buckets = new Map<string | undefined, typeof targets>()
  for (const zone of targets) {
    const url = zone.clientUploads?.edge?.scriptUrl || undefined
    const list = buckets.get(url) ?? []
    list.push(zone)
    buckets.set(url, list)
  }

  const groups: EdgeDeployGroup[] = []
  for (const [scriptUrl, zonesInGroup] of buckets) {
    const zones = Object.fromEntries(
      zonesInGroup.map((z) => [z.zoneName, { accessKey: z.apiKey, host: storageHostFor(z.region) }]),
    )
    const zoneNames = zonesInGroup.map((z) => z.zoneName)

    const distinctSecrets = [
      ...new Set(zonesInGroup.map((z) => z.clientUploads?.edge?.secret).filter((s): s is string => Boolean(s))),
    ]
    let sharedSecret: string | undefined
    let secretConflict = false
    if (distinctSecrets.length === 1) {
      sharedSecret = distinctSecrets[0]
    } else if (distinctSecrets.length >= 2) {
      secretConflict = true
      errors.push(
        `storage zones [${zoneNames.join(', ')}] configure different \`clientUploads.edge.secret\` values; a shared Edge Script needs one secret — align them (or pass --secret to override)`,
      )
    }

    groups.push({ scriptUrl, secretConflict, sharedSecret, zoneNames, zones })
  }

  return { errors, groups }
}

type ZonesFileEntry = {
  accessKey?: string
  accessKeyEnv?: string
  region?: string
}

export const loadZonesFileGroup = (filePath: string): EdgeDeployGroup => {
  const resolved = nodePath.resolve(process.cwd(), filePath)

  let contents: string
  try {
    contents = readFileSync(resolved, 'utf8')
  } catch (err) {
    throw new Error(`could not read zones file "${resolved}": ${(err as Error).message}`, { cause: err })
  }

  let parsed: Record<string, ZonesFileEntry>
  try {
    parsed = JSON.parse(contents) as Record<string, ZonesFileEntry>
  } catch (err) {
    throw new Error(`zones file "${resolved}" is not valid JSON: ${(err as Error).message}`, { cause: err })
  }

  const zones: Record<string, { accessKey: string; host: string }> = {}
  const zoneNames: string[] = []
  for (const [zoneName, entry] of Object.entries(parsed)) {
    const accessKey = entry.accessKey ?? (entry.accessKeyEnv ? process.env[entry.accessKeyEnv] : undefined)
    if (!accessKey) {
      const via = entry.accessKeyEnv ? ` (env var "${entry.accessKeyEnv}" is not set)` : ''
      throw new Error(`zones file entry "${zoneName}" is missing an accessKey${via}`)
    }
    zones[zoneName] = { accessKey, host: storageHostFor(entry.region) }
    zoneNames.push(zoneName)
  }

  if (zoneNames.length === 0) {
    throw new Error(`zones file "${resolved}" contains no zones`)
  }

  return { zoneNames, zones }
}

export type DeployEdgeScriptResult = {
  created: boolean
  scriptId: number
  scriptUrl: string
  sharedSecret: string
}

type ScriptSummary = {
  Id: number
  LinkedPullZones?: Array<{ DefaultHostname?: string; Id: number }>
  Name: string
}

const bunnyFetch = async (
  accountApiKey: string,
  path: string,
  init: { body?: unknown; method?: string } = {},
): Promise<Response> => {
  const response = await fetch(`${BUNNY_API_BASE}${path}`, {
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers: {
      accept: 'application/json',
      AccessKey: accountApiKey,
      'content-type': 'application/json',
    },
    method: init.method ?? 'GET',
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Bunny API ${init.method ?? 'GET'} ${path} failed (${response.status}): ${text}`)
  }

  return response
}

const findScriptByName = async (accountApiKey: string, name: string): Promise<ScriptSummary | undefined> => {
  const response = await bunnyFetch(accountApiKey, '/compute/script?page=1&perPage=1000')
  const data = (await response.json()) as { Items?: ScriptSummary[] }
  return data.Items?.find((item) => item.Name === name)
}

export const checkEdgeScriptVersion = async (scriptUrl: string): Promise<string | undefined> => {
  try {
    const res = await fetch(`${scriptUrl.replace(/\/+$/, '')}/upload`, { method: 'OPTIONS' })
    return res.headers.get('X-Edge-Version') ?? undefined
  } catch {
    return undefined
  }
}

const getScript = async (accountApiKey: string, scriptId: number): Promise<ScriptSummary> => {
  const response = await bunnyFetch(accountApiKey, `/compute/script/${scriptId}`)
  return (await response.json()) as ScriptSummary
}

const setSecrets = async (
  accountApiKey: string,
  scriptId: number,
  secrets: Array<{ Name: string; Secret: string }>,
  staleNames: string[] = [],
  logger?: DeployLogger,
): Promise<void> => {
  const response = await bunnyFetch(accountApiKey, `/compute/script/${scriptId}/secrets`)
  const existing = ((await response.json()) as { Secrets?: Array<{ Id: number; Name: string }> }).Secrets ?? []
  const idByName = new Map(existing.map((secret) => [secret.Name, secret.Id]))

  for (const secret of secrets) {
    const id = idByName.get(secret.Name)
    const path = id === undefined ? `/compute/script/${scriptId}/secrets` : `/compute/script/${scriptId}/secrets/${id}`
    await bunnyFetch(accountApiKey, path, { body: secret, method: 'POST' })
  }

  for (const name of staleNames) {
    const id = idByName.get(name)
    if (id === undefined) {
      continue
    }
    try {
      await bunnyFetch(accountApiKey, `/compute/script/${scriptId}/secrets/${id}`, { method: 'DELETE' })
    } catch (err) {
      logger?.warn(`Could not remove stale secret "${name}": ${(err as Error).message}`)
    }
  }
}

const hostnameOf = (script: ScriptSummary): string | undefined => script.LinkedPullZones?.[0]?.DefaultHostname

const toScriptUrl = (host?: string): string => {
  if (!host) {
    return ''
  }
  return /^https?:\/\//i.test(host) ? host.replace(/\/+$/, '') : `https://${host}`
}

const hardenPullZone = async (options: DeployEdgeScriptOptions, pullZoneId: number): Promise<void> => {
  const { accountApiKey, cdnTier, connectionLimit, logger, requestLimit } = options

  try {
    const current = (await (await bunnyFetch(accountApiKey, `/pullzone/${pullZoneId}`)).json()) as {
      EdgeRules?: Array<{ Description?: string; Guid?: string }>
    }
    const guidByDescription = new Map(
      (current.EdgeRules ?? [])
        .filter((rule) => rule.Description && rule.Guid)
        .map((rule) => [rule.Description, rule.Guid]),
    )

    await bunnyFetch(accountApiKey, `/pullzone/${pullZoneId}`, {
      body: {
        BlockPostRequests: true,
        BlockRootPathAccess: true,
        CacheControlBrowserMaxAgeOverride: 0,
        CacheControlMaxAgeOverride: 0,
        ConnectionLimitPerIPCount: connectionLimit,
        DisableCookies: true,
        EnableAvifVary: false,
        EnableCacheSlice: false,
        EnableCountryCodeVary: false,
        EnableMobileVary: false,
        EnableRequestCoalescing: false,
        EnableSmartCache: false,
        EnableWebpVary: false,
        OptimizerEnabled: false,
        RequestLimit: requestLimit,
        Type: cdnTier === 'standard' ? 0 : 1,
        ZoneSecurityEnabled: false,
      },
      method: 'POST',
    })

    const edgeRules = [
      {
        ActionType: 0,
        Description: 'payload-storage-bunny: force SSL',
        Enabled: true,
        TriggerMatchingType: 0,
        Triggers: [
          {
            PatternMatches: ['*'],
            PatternMatchingType: 0,
            Type: 0,
          },
        ],
      },
      {
        ActionType: 4,
        Description: 'payload-storage-bunny: allow only PUT and OPTIONS',
        Enabled: true,
        TriggerMatchingType: 0,
        Triggers: [
          {
            PatternMatches: ['GET', 'HEAD', 'POST', 'DELETE', 'PATCH'],
            PatternMatchingType: 0,
            Type: 9,
          },
        ],
      },
      {
        ActionType: 4,
        Description: 'payload-storage-bunny: allow only /upload path',
        Enabled: true,
        TriggerMatchingType: 2,
        Triggers: [
          {
            PatternMatches: ['*/upload', '*/upload?*'],
            PatternMatchingType: 0,
            Type: 0,
          },
        ],
      },
    ]

    for (const rule of edgeRules) {
      const guid = guidByDescription.get(rule.Description)
      await bunnyFetch(accountApiKey, `/pullzone/${pullZoneId}/edgerules/addOrUpdate`, {
        body: guid ? { ...rule, Guid: guid } : rule,
        method: 'POST',
      })
    }

    logger.info('Hardened the linked Pull Zone (SSL, PUT/OPTIONS + /upload only, root/POST blocked, req/conn limits).')
  } catch (err) {
    logger.warn(`Pull Zone hardening was partially applied: ${(err as Error).message}`)
    logger.warn('Review the linked Pull Zone settings in the Bunny dashboard.')
  }
}

export const deployEdgeScript = async (options: DeployEdgeScriptOptions): Promise<DeployEdgeScriptResult> => {
  const { accountApiKey, allowedOrigins, code, dryRun, logger, name, sharedSecret, zones } = options

  const existing = await findScriptByName(accountApiKey, name)

  if (dryRun) {
    const verb = existing ? 'update' : 'create'
    logger.info(`Dry run: would ${verb} script "${name}" serving zones [${Object.keys(zones).join(', ')}].`)
    return {
      created: !existing,
      scriptId: existing?.Id ?? 0,
      scriptUrl: existing ? toScriptUrl(hostnameOf(existing)) : '',
      sharedSecret,
    }
  }

  let script = existing
  let created = false

  if (!script) {
    const response = await bunnyFetch(accountApiKey, '/compute/script', {
      body: { CreateLinkedPullZone: true, Name: name, ScriptType: 1 },
      method: 'POST',
    })
    script = (await response.json()) as ScriptSummary
    created = true
    logger.info(`Created Edge Script "${name}" (id ${script.Id}).`)
  } else {
    logger.info(`Reusing existing Edge Script "${name}" (id ${script.Id}).`)
  }

  await bunnyFetch(accountApiKey, `/compute/script/${script.Id}/code`, {
    body: { Code: code },
    method: 'POST',
  })

  const secrets: Array<{ Name: string; Secret: string }> = [
    { Name: 'SHARED_SECRET', Secret: sharedSecret },
    { Name: 'ZONES', Secret: JSON.stringify(zones) },
  ]
  if (allowedOrigins) {
    secrets.push({ Name: 'ALLOWED_ORIGINS', Secret: allowedOrigins })
  }

  await setSecrets(accountApiKey, script.Id, secrets, STALE_ZONE_SECRETS, logger)

  await bunnyFetch(accountApiKey, `/compute/script/${script.Id}/publish`, {
    body: { Note: 'payload-storage-bunny' },
    method: 'POST',
  })
  logger.info('Published the Edge Script.')

  const pullZoneId =
    script.LinkedPullZones?.[0]?.Id ?? (await getScript(accountApiKey, script.Id)).LinkedPullZones?.[0]?.Id
  if (!options.skipHarden && typeof pullZoneId === 'number') {
    await hardenPullZone(options, pullZoneId)
  }

  const hostname = hostnameOf(script) ?? hostnameOf(await getScript(accountApiKey, script.Id))

  return {
    created,
    scriptId: script.Id,
    scriptUrl: toScriptUrl(hostname),
    sharedSecret,
  }
}
