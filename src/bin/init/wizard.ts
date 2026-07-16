import { readFileSync } from 'node:fs'
import path from 'node:path'

import { cancel, confirm, isCancel, log, multiselect, note, password, select, spinner, text } from '@clack/prompts'

import { bunnyJson, maskKey } from '@/bin/shared/bunnyApi.js'
import type { Logger } from '@/bin/shared/logger.js'

import type { InitAnswers, InitService, RegionOption, StorageAccess, StorageTier } from './plan.js'
import {
  DEFAULT_REGION,
  deriveBaseName,
  deriveVideoLibraryName,
  PRICING,
  replicationOptions,
  storageMainRegionOptions,
  storageReplicationRegionOptions,
  storageTierPrice,
  streamRegionOptions,
  validateCollectionSlug,
  validateStorageZoneName,
  wantsStorage,
  wantsStream,
} from './plan.js'
import { checkLibraryName, checkStorageName, resolveAvailableName } from './provision.js'

const SERVICE_OPTIONS = [
  { label: 'Both storage and stream', value: 'both' as const },
  { label: 'Storage (files and images)', value: 'storage' as const },
  { label: 'Stream (video)', value: 'stream' as const },
]

const STORAGE_ACCESS_OPTIONS = [
  { hint: 'Bunny HTTP Storage API', label: 'HTTP API (default)', value: 'http' as const },
  { hint: 'S3-compatible (SigV4), enables presigned client uploads', label: 'S3-compatible', value: 's3' as const },
]

const STORAGE_TIER_OPTIONS = [
  { hint: `HDD, cheaper · ${PRICING.storagePerGb.standard}`, label: 'Standard (default)', value: 'standard' as const },
  { hint: `SSD, faster, pricier · ${PRICING.storagePerGb.edge}`, label: 'Edge (SSD)', value: 'edge' as const },
]

const REPLICATION_WARNING =
  'Replication zones cannot be removed later. Once the zone is created with replication regions, Bunny does not let you remove them — the only way is to delete and recreate the zone. Choose carefully.'

const must = <T>(value: T | symbol): T => {
  if (isCancel(value)) {
    cancel('Cancelled — nothing was created.')
    process.exit(1)
  }
  return value as T
}

const pickReplication = async (all: RegionOption[], mainCode: string, priceNote: string): Promise<string[]> => {
  const options = replicationOptions(all, mainCode)
  if (options.length === 0) {
    return []
  }
  note(REPLICATION_WARNING, '⚠ Replication is permanent')
  note(priceNote, 'Replication pricing (approx)')
  return must(
    await multiselect<string>({
      message: 'Add replication (availability) regions? Optional — space to toggle, enter to confirm.',
      options: options.map((option) => ({ label: option.label, value: option.code })),
      required: false,
    }),
  )
}

const readPackageName = (): string | undefined => {
  try {
    const contents = readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')
    const parsed = JSON.parse(contents) as { name?: string }
    return typeof parsed.name === 'string' ? parsed.name : undefined
  } catch {
    return undefined
  }
}

const resolveStorageZoneName = async (accountApiKey: string, initial: string): Promise<string> => {
  const check = async (candidate: string) => {
    const s = spinner()
    s.start('Checking name availability…')
    try {
      const result = await checkStorageName(accountApiKey, candidate)
      if (result.status === 'reuse') {
        s.stop(`Will reuse your existing storage zone "${candidate}".`)
      } else if (result.status === 'available') {
        s.stop(`"${candidate}" is available.`)
      } else {
        s.stop(`"${candidate}" is not available.`)
      }
      return result
    } catch (err) {
      s.stop('Could not check name availability.')
      throw err
    }
  }

  const reprompt = async (message: string): Promise<string> => {
    log.warn(message)
    return must(
      await text({
        message: 'Choose a different storage zone name',
        validate: (value) => validateStorageZoneName(value ?? ''),
      }),
    )
  }

  const resolved = await resolveAvailableName(initial, check, reprompt)
  return resolved.name
}

const noteVideoLibraryName = async (accountApiKey: string, name: string): Promise<void> => {
  const s = spinner()
  s.start('Checking the video library…')
  try {
    const status = await checkLibraryName(accountApiKey, name)
    s.stop(
      status === 'reuse'
        ? `Will reuse your existing video library "${name}".`
        : `Will create a new video library "${name}".`,
    )
  } catch (err) {
    s.stop('Could not check the video library.')
    throw err
  }
}

export const resolveAccountApiKey = async (apiKey: string | undefined, logger: Logger): Promise<string> => {
  let candidate = apiKey ?? process.env.BUNNY_ACCOUNT_API_KEY
  let attempt = 0

  if (!candidate) {
    logger.info(
      'No Bunny account yet? Sign up (referral): https://bunny.net?ref=fndfoymy0j — then copy your account API key from the dashboard: Account → API.',
    )
  }

  while (attempt < 3) {
    if (!candidate) {
      candidate = must(
        await password({
          message: 'Bunny account API key (dashboard → Account → API)',
          validate: (value) => ((value ?? '').length === 0 ? 'The account API key is required.' : undefined),
        }),
      )
    }

    const s = spinner()
    s.start('Verifying the account API key…')
    try {
      await bunnyJson<unknown>(candidate, '/pullzone?page=1&perPage=5')
      s.stop(`Account API key verified (${maskKey(candidate)}).`)
      return candidate
    } catch {
      s.stop('Bunny rejected that account API key.')
      logger.error('Could not authenticate with that key. Check it in the Bunny dashboard and try again.')
      candidate = undefined
      attempt += 1
    }
  }

  cancel('Too many failed attempts — nothing was created.')
  process.exit(1)
}

export const runWizard = async (accountApiKey: string): Promise<InitAnswers> => {
  const service = must(
    await select<InitService>({
      initialValue: 'both',
      message: 'What do you want to set up?',
      options: SERVICE_OPTIONS,
    }),
  )

  const collectionSlug = must(
    await text({
      defaultValue: 'media',
      message: 'Which collection slug should use Bunny?',
      placeholder: 'media',
      validate: (value) => ((value ?? '').length === 0 ? undefined : validateCollectionSlug(value ?? '')),
    }),
  )

  const baseName = deriveBaseName(readPackageName())

  let storageZoneName = baseName
  let region = DEFAULT_REGION
  let storageAccess: StorageAccess = 'http'
  let storageTier: StorageTier = 'standard'
  let storageReplication: string[] = []
  let clientUploads = false
  let deployEdge = false
  let optimizer = false

  if (wantsStorage(service)) {
    const typedZoneName = must(
      await text({
        defaultValue: baseName,
        message: 'Storage zone name (also the pull zone / CDN hostname)',
        placeholder: baseName,
        validate: (value) => ((value ?? '').length === 0 ? undefined : validateStorageZoneName(value ?? '')),
      }),
    )
    storageZoneName = await resolveStorageZoneName(accountApiKey, typedZoneName.length === 0 ? baseName : typedZoneName)

    storageAccess = must(
      await select<StorageAccess>({
        initialValue: 'http',
        message: 'How should the storage zone be accessed?',
        options: STORAGE_ACCESS_OPTIONS,
      }),
    )

    storageTier = must(
      await select<StorageTier>({
        initialValue: 'standard',
        message: 'Which storage tier?',
        options: STORAGE_TIER_OPTIONS,
      }),
    )

    if (storageTier === 'edge') {
      region = DEFAULT_REGION
      note(
        'Edge (SSD) storage zones are always created in Frankfurt (DE); the main region cannot be changed. Only replication (availability) regions are configurable.',
        'Storage region',
      )
    } else {
      region = must(
        await select<string>({
          initialValue: DEFAULT_REGION,
          message: 'Which main storage region?',
          options: storageMainRegionOptions(storageAccess).map((option) => ({
            label: option.label,
            value: option.code,
          })),
        }),
      )
    }

    storageReplication = await pickReplication(
      storageReplicationRegionOptions(storageAccess, storageTier),
      region,
      `Storage replication: each additional region adds +${storageTierPrice(storageTier)} on top of the main region's ${storageTierPrice(storageTier)}.`,
    )

    note(
      `Bunny Optimizer: automatic WebP/AVIF conversion, compression, and on-the-fly image resizing via URL params (?width=…). Flat ${PRICING.optimizerMonthly}, unlimited transformations. CDN bandwidth billed separately.`,
      'Image optimization (paid)',
    )
    optimizer = must(
      await confirm({
        initialValue: false,
        message: `Enable Bunny Optimizer image optimization on the pull zone (${PRICING.optimizerMonthly})?`,
      }),
    )

    clientUploads = must(
      await confirm({
        initialValue: false,
        message:
          'Enable browser-direct client uploads? For large files or serverless body-size limits (e.g. Vercel ~4.5 MB) — file bytes go straight from the browser to Bunny.',
      }),
    )

    if (clientUploads && storageAccess === 'http') {
      note(
        'HTTP-API zones need a Bunny Edge Script to proxy client uploads. Edge Scripting (compute) is an additional Bunny cost.',
        'Edge Script required',
      )
      deployEdge = must(
        await confirm({
          initialValue: true,
          message: 'Deploy the Edge Script now? Choose No to run `bunny:deploy-edge-script` later.',
        }),
      )
      if (!deployEdge) {
        log.info(
          'Skipping the Edge Script — run `npx payload bunny:deploy-edge-script` later, then add its `edge` block.',
        )
      }
    }
  }

  let videoLibraryName = deriveVideoLibraryName(baseName)
  let streamReplication: string[] = []
  if (wantsStream(service)) {
    const typedLibraryName = must(
      await text({
        defaultValue: deriveVideoLibraryName(baseName),
        message: 'Video library name',
        placeholder: deriveVideoLibraryName(baseName),
        validate: (value) => ((value ?? '').length === 0 ? undefined : validateCollectionSlug(value ?? '')),
      }),
    )
    videoLibraryName = typedLibraryName.length === 0 ? deriveVideoLibraryName(baseName) : typedLibraryName
    await noteVideoLibraryName(accountApiKey, videoLibraryName)

    note(
      'The Stream library main region is fixed at Frankfurt (DE) and cannot be changed. Only replication (availability) regions are configurable.',
      'Stream region',
    )
    streamReplication = await pickReplication(
      streamRegionOptions(),
      DEFAULT_REGION,
      `Stream replication storage: main region ${PRICING.streamMainPerGb}, the first additional region ${PRICING.streamFirstReplicaPerGb}, each subsequent ${PRICING.streamAdditionalReplicaPerGb}.`,
    )
  }

  const signedUrls = must(
    await confirm({
      initialValue: false,
      message: 'Enable signed URLs (token authentication)?',
    }),
  )

  const purge = must(
    await confirm({
      initialValue: false,
      message: 'Enable CDN cache purge on upload/delete? Writes your account key into app env.',
    }),
  )

  return {
    clientUploads,
    deployEdge,
    optimizer,
    storageReplication,
    streamReplication,
    collectionSlug: collectionSlug.length === 0 ? 'media' : collectionSlug,
    purge,
    region,
    service,
    signedUrls,
    storageAccess,
    storageTier,
    storageZoneName,
    videoLibraryName,
  }
}
