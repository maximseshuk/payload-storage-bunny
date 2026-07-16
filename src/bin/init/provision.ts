import { randomBytes } from 'node:crypto'

import { deployEdgeScript, edgeScriptExists, storageHostFor } from '@/bin/deployEdgeScript/core.js'
import { bunnyJson, hostnameOf, listItems } from '@/bin/shared/bunnyApi.js'
import type { Logger } from '@/bin/shared/logger.js'
import { EDGE_SCRIPT_SOURCE } from '@/storage/clientUploads/edge/embedded.js'

import type { InitPlan, StoragePlanStep, StreamPlanStep } from './plan.js'

const EDGE_SCRIPT_NAME = 'payload-storage-bunny-uploader'

const PULL_ZONE_DEFAULTS = {
  EnableTLS1: false,
  EnableTLS1_1: false,
  ErrorPageWhitelabel: true,
  IgnoreQueryStrings: true,
  UseStaleWhileOffline: true,
}

const OPTIMIZER_FIELDS = {
  OptimizerAutomaticOptimizationEnabled: true,
  OptimizerEnableManipulationEngine: true,
  OptimizerEnableWebP: true,
  OptimizerEnabled: true,
  OptimizerMinifyCSS: false,
  OptimizerMinifyJavaScript: false,
}

type StorageZoneRecord = {
  Id: number
  Name: string
  Password?: string
}

type PullZoneRecord = {
  Hostnames?: Array<{ Value?: string }>
  Id: number
  Name: string
  OptimizerEnabled?: boolean
  OriginType?: number
  StorageZoneId?: number
  ZoneSecurityEnabled?: boolean
  ZoneSecurityKey?: string
}

type VideoLibraryRecord = {
  ApiKey?: string
  Id: number
  Name: string
  PullZoneId?: number
}

type AvailabilityResponse = {
  Available?: boolean
}

export type ResourceKind = 'pull zone' | 'storage zone' | 'video library'

export type LedgerEntry = {
  id: number
  kind: ResourceKind
  name: string
}

export type Ledger = {
  created: LedgerEntry[]
  reused: LedgerEntry[]
}

export type StorageProvisionResult = {
  apiKey: string
  edge?: { scriptUrl: string; secret: string; secretKnown?: boolean }
  hostname: string
  region: string
  tokenSecurityKey?: string
  zoneName: string
}

export type StreamProvisionResult = {
  apiKey: string
  hostname: string
  libraryId: number
  tokenSecurityKey?: string
}

export type ProvisionResult = {
  ledger: Ledger
  storage?: StorageProvisionResult
  stream?: StreamProvisionResult
}

export type ResourceDisposition = 'create' | 'reuse'

export type PreflightIssue = {
  message: string
  resource: ResourceKind
}

export type PreflightResult = {
  edgeScript?: ResourceDisposition
  issues: PreflightIssue[]
  storage?: ResourceDisposition
  storagePullZone?: ResourceDisposition
  stream?: ResourceDisposition
}

export type EdgeProvisionInput = {
  reuseScript: boolean
  sharedSecret?: string
}

export type ProvisionInput = {
  accountApiKey: string
  edge?: EdgeProvisionInput
  ledger: Ledger
  logger: Logger
  onStep?: (message: string) => void
  plan: InitPlan
}

export const createLedger = (): Ledger => ({ created: [], reused: [] })

const findStorageZone = async (accountApiKey: string, name: string): Promise<StorageZoneRecord | undefined> => {
  const payload = await bunnyJson<unknown>(accountApiKey, '/storagezone?page=1&perPage=1000')
  return listItems<StorageZoneRecord>(payload).find((zone) => zone.Name === name)
}

const isStorageZoneNameAvailable = async (accountApiKey: string, name: string): Promise<boolean> => {
  const payload = await bunnyJson<AvailabilityResponse>(accountApiKey, '/storagezone/checkavailability', {
    body: { Name: name },
    method: 'POST',
  })
  return payload.Available !== false
}

const findPullZone = async (accountApiKey: string, name: string): Promise<PullZoneRecord | undefined> => {
  const payload = await bunnyJson<unknown>(accountApiKey, '/pullzone?page=1&perPage=1000')
  return listItems<PullZoneRecord>(payload).find((zone) => zone.Name === name)
}

const findVideoLibrary = async (accountApiKey: string, name: string): Promise<VideoLibraryRecord | undefined> => {
  const payload = await bunnyJson<unknown>(accountApiKey, '/videolibrary?page=1&perPage=1000')
  return listItems<VideoLibraryRecord>(payload).find((library) => library.Name === name)
}

export type NameStatus = 'available' | 'reuse' | 'taken'

export type NameCheck = {
  detail?: string
  status: NameStatus
}

export type NameResolution = {
  name: string
  reuse: boolean
}

export const checkStorageName = async (accountApiKey: string, name: string): Promise<NameCheck> => {
  const existingZone = await findStorageZone(accountApiKey, name)
  const existingPullZone = await findPullZone(accountApiKey, name)

  if (existingPullZone) {
    const ownsZone =
      existingPullZone.OriginType === 2 &&
      (existingZone === undefined || existingPullZone.StorageZoneId === existingZone.Id)
    if (!ownsZone) {
      return {
        detail: `a pull zone named "${name}" already exists but is not linked to your storage zone — pick another name`,
        status: 'taken',
      }
    }
  }

  if (existingZone) {
    return { status: 'reuse' }
  }

  if (!(await isStorageZoneNameAvailable(accountApiKey, name))) {
    return { detail: `the storage zone name "${name}" is taken globally — pick another`, status: 'taken' }
  }

  return { status: 'available' }
}

export const checkLibraryName = async (accountApiKey: string, name: string): Promise<NameStatus> =>
  (await findVideoLibrary(accountApiKey, name)) ? 'reuse' : 'available'

export const resolveAvailableName = async (
  name: string,
  check: (candidate: string) => Promise<NameCheck>,
  reprompt: (message: string) => Promise<string>,
): Promise<NameResolution> => {
  const result = await check(name)
  if (result.status !== 'taken') {
    return { name, reuse: result.status === 'reuse' }
  }
  const next = await reprompt(result.detail ?? `the name "${name}" is taken — pick another`)
  return resolveAvailableName(next, check, reprompt)
}

export const preflightInit = async (accountApiKey: string, plan: InitPlan): Promise<PreflightResult> => {
  const issues: PreflightIssue[] = []
  const result: PreflightResult = { issues }

  if (plan.storage) {
    const existingZone = await findStorageZone(accountApiKey, plan.storage.zoneName)
    if (existingZone) {
      result.storage = 'reuse'
    } else {
      result.storage = 'create'
      if (!(await isStorageZoneNameAvailable(accountApiKey, plan.storage.zoneName))) {
        issues.push({
          message: `storage zone name "${plan.storage.zoneName}" is already taken by another Bunny account — choose a different name`,
          resource: 'storage zone',
        })
      }
    }

    const existingPullZone = await findPullZone(accountApiKey, plan.storage.zoneName)
    if (existingPullZone) {
      const ownsZone =
        existingPullZone.OriginType === 2 &&
        (existingZone === undefined || existingPullZone.StorageZoneId === existingZone.Id)
      if (ownsZone) {
        result.storagePullZone = 'reuse'
      } else {
        issues.push({
          message: `pull zone "${plan.storage.zoneName}" already exists but is not linked to this storage zone — choose a different name`,
          resource: 'pull zone',
        })
      }
    } else {
      result.storagePullZone = 'create'
    }
  }

  if (plan.stream) {
    const existingLibrary = await findVideoLibrary(accountApiKey, plan.stream.libraryName)
    result.stream = existingLibrary ? 'reuse' : 'create'
  }

  if (plan.storage?.deployEdge) {
    result.edgeScript = (await edgeScriptExists(accountApiKey, EDGE_SCRIPT_NAME)) ? 'reuse' : 'create'
  }

  return result
}

const applyPullZoneSettings = async (
  accountApiKey: string,
  pullZoneId: number,
  settings: Record<string, unknown>,
): Promise<void> => {
  await bunnyJson<PullZoneRecord>(accountApiKey, `/pullzone/${pullZoneId}`, {
    body: settings,
    method: 'POST',
  })
}

const enablePullZoneSecurity = async (accountApiKey: string, pullZoneId: number): Promise<PullZoneRecord> => {
  let zone = await bunnyJson<PullZoneRecord>(accountApiKey, `/pullzone/${pullZoneId}`)
  if (!zone.ZoneSecurityEnabled) {
    await bunnyJson<PullZoneRecord>(accountApiKey, `/pullzone/${pullZoneId}`, {
      body: { ZoneSecurityEnabled: true },
      method: 'POST',
    })
    zone = await bunnyJson<PullZoneRecord>(accountApiKey, `/pullzone/${pullZoneId}`)
  }
  return zone
}

const provisionStorage = async (input: ProvisionInput, step: StoragePlanStep): Promise<StorageProvisionResult> => {
  const { accountApiKey, ledger, logger, onStep } = input

  onStep?.(`Setting up storage zone "${step.zoneName}"…`)
  let zone = await findStorageZone(accountApiKey, step.zoneName)
  if (zone) {
    ledger.reused.push({ id: zone.Id, kind: 'storage zone', name: zone.Name })
  } else {
    if (!(await isStorageZoneNameAvailable(accountApiKey, step.zoneName))) {
      throw new Error(
        `storage zone name "${step.zoneName}" is already taken by another Bunny account — re-run with a different name`,
      )
    }
    zone = await bunnyJson<StorageZoneRecord>(accountApiKey, '/storagezone', {
      body: {
        Name: step.zoneName,
        Region: step.region,
        ...(step.ssd ? { ZoneTier: 1 } : {}),
        ...(step.s3 ? { StorageZoneType: 1 } : {}),
        ...(step.replication.length > 0 ? { ReplicationRegions: step.replication } : {}),
      },
      method: 'POST',
    })
    ledger.created.push({ id: zone.Id, kind: 'storage zone', name: zone.Name })
  }

  onStep?.(`Setting up pull zone "${step.zoneName}"…`)
  let pullZone = await findPullZone(accountApiKey, step.zoneName)
  if (pullZone) {
    const ownsZone = pullZone.OriginType === 2 && pullZone.StorageZoneId === zone.Id
    if (!ownsZone) {
      throw new Error(
        `pull zone "${step.zoneName}" already exists but is not linked to this storage zone — re-run with a different name`,
      )
    }
    ledger.reused.push({ id: pullZone.Id, kind: 'pull zone', name: pullZone.Name })
    if (step.optimizer && pullZone.OptimizerEnabled !== true) {
      onStep?.('Enabling Bunny Optimizer on the pull zone…')
      await applyPullZoneSettings(accountApiKey, pullZone.Id, OPTIMIZER_FIELDS)
    }
  } else {
    pullZone = await bunnyJson<PullZoneRecord>(accountApiKey, '/pullzone', {
      body: {
        Name: step.zoneName,
        OriginType: 2,
        StorageZoneId: zone.Id,
        Type: step.pullZoneTier,
        ZoneSecurityEnabled: step.secure,
        ...PULL_ZONE_DEFAULTS,
        ...(step.optimizer ? OPTIMIZER_FIELDS : {}),
      },
      method: 'POST',
    })
    ledger.created.push({ id: pullZone.Id, kind: 'pull zone', name: pullZone.Name })
  }

  let resolved = await bunnyJson<PullZoneRecord>(accountApiKey, `/pullzone/${pullZone.Id}`)
  if (step.secure) {
    resolved = await enablePullZoneSecurity(accountApiKey, pullZone.Id)
  }

  let edge: { scriptUrl: string; secret: string; secretKnown?: boolean } | undefined
  if (step.deployEdge) {
    onStep?.('Deploying the Edge Script for client uploads…')
    const reuseScript = input.edge?.reuseScript ?? false
    const secretKnown = !reuseScript || input.edge?.sharedSecret !== undefined
    const secret = input.edge?.sharedSecret ?? (reuseScript ? '' : randomBytes(16).toString('hex'))
    const host = storageHostFor(step.region === 'DE' ? undefined : step.region.toLowerCase())
    const deployed = await deployEdgeScript({
      accountApiKey,
      additive: true,
      cdnTier: 'volume',
      code: EDGE_SCRIPT_SOURCE,
      connectionLimit: 10,
      dryRun: false,
      logger,
      name: EDGE_SCRIPT_NAME,
      requestLimit: 30,
      sharedSecret: secret,
      skipHarden: false,
      writeSharedSecret: !reuseScript,
      zones: { [step.zoneName]: { accessKey: zone.Password ?? '', host } },
    })
    edge = { scriptUrl: deployed.scriptUrl, secret: deployed.sharedSecret, secretKnown }
  }

  return {
    apiKey: zone.Password ?? '',
    edge,
    hostname: hostnameOf(resolved),
    region: step.region.toLowerCase(),
    tokenSecurityKey: step.secure ? resolved.ZoneSecurityKey : undefined,
    zoneName: zone.Name,
  }
}

const provisionStream = async (input: ProvisionInput, step: StreamPlanStep): Promise<StreamProvisionResult> => {
  const { accountApiKey, ledger, logger, onStep } = input

  onStep?.(`Setting up video library "${step.libraryName}"…`)
  let library = await findVideoLibrary(accountApiKey, step.libraryName)
  if (library) {
    ledger.reused.push({ id: library.Id, kind: 'video library', name: library.Name })
  } else {
    library = await bunnyJson<VideoLibraryRecord>(accountApiKey, '/videolibrary', {
      body: {
        Name: step.libraryName,
        ...(step.replication.length > 0 ? { ReplicationRegions: step.replication } : {}),
      },
      method: 'POST',
    })
    ledger.created.push({ id: library.Id, kind: 'video library', name: library.Name })
  }

  let hostname = ''
  let tokenSecurityKey: string | undefined
  const pullZoneId = library.PullZoneId
  if (typeof pullZoneId === 'number') {
    try {
      let pullZone = await bunnyJson<PullZoneRecord>(accountApiKey, `/pullzone/${pullZoneId}`)
      if (step.secure) {
        pullZone = await enablePullZoneSecurity(accountApiKey, pullZoneId)
      }
      hostname = hostnameOf(pullZone)
      tokenSecurityKey = step.secure ? pullZone.ZoneSecurityKey : undefined
    } catch (err) {
      logger.warn(`could not read the stream pull zone ${pullZoneId}: ${(err as Error).message}`)
      logger.warn('copy the hostname and token key from the Stream dashboard and fill the .env manually.')
    }
  }

  return {
    apiKey: library.ApiKey ?? '',
    hostname,
    libraryId: library.Id,
    tokenSecurityKey,
  }
}

export const provisionInit = async (input: ProvisionInput): Promise<ProvisionResult> => {
  const result: ProvisionResult = { ledger: input.ledger }

  if (input.plan.storage) {
    result.storage = await provisionStorage(input, input.plan.storage)
  }

  if (input.plan.stream) {
    result.stream = await provisionStream(input, input.plan.stream)
  }

  return result
}
