const BUNNY_API_BASE = 'https://api.bunny.net'

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
  storageAccessKey: string
  storageHost: string
  storageZone: string
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
): Promise<void> => {
  const response = await bunnyFetch(accountApiKey, `/compute/script/${scriptId}/secrets`)
  const existing = ((await response.json()) as { Secrets?: Array<{ Id: number; Name: string }> }).Secrets ?? []
  const idByName = new Map(existing.map((secret) => [secret.Name, secret.Id]))

  for (const secret of secrets) {
    const id = idByName.get(secret.Name)
    const path = id === undefined ? `/compute/script/${scriptId}/secrets` : `/compute/script/${scriptId}/secrets/${id}`
    await bunnyFetch(accountApiKey, path, { body: secret, method: 'POST' })
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
  const { accountApiKey, allowedOrigins, code, dryRun, logger, name, sharedSecret } = options

  const existing = await findScriptByName(accountApiKey, name)

  if (dryRun) {
    logger.info(
      existing
        ? `Dry run: would update existing script "${name}" (id ${existing.Id}) and republish.`
        : `Dry run: would create script "${name}" with a linked Pull Zone and publish.`,
    )
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
    { Name: 'STORAGE_HOST', Secret: options.storageHost },
    { Name: 'STORAGE_ZONE', Secret: options.storageZone },
    { Name: 'STORAGE_ACCESS_KEY', Secret: options.storageAccessKey },
  ]
  if (allowedOrigins) {
    secrets.push({ Name: 'ALLOWED_ORIGINS', Secret: allowedOrigins })
  }

  await setSecrets(accountApiKey, script.Id, secrets)

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
