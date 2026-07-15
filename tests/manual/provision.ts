import { getBooleanFlag, getFlag, parseFlags } from '../../src/bin/flags.js'
import { log } from '../helpers/shared/log.js'

const BASE = 'https://api.bunny.net'

const flags = parseFlags(process.argv.slice(2))
const accountKey = getFlag(flags, 'api-key') ?? process.env.BUNNY_ACCOUNT_API_KEY ?? ''
const prefix = getFlag(flags, 'prefix') ?? 'psb-e2e'
const region = (getFlag(flags, 'region') ?? 'DE').toUpperCase()
const dumpJson = getBooleanFlag(flags, 'json')
const dryRun = getBooleanFlag(flags, 'dry-run')

if (!accountKey) {
  log.error('Missing account API key. Pass --api-key or set BUNNY_ACCOUNT_API_KEY.')
  process.exit(1)
}

type Json = Record<string, any>

const api = async (method: string, path: string, body?: Json): Promise<Json> => {
  const res = await fetch(`${BASE}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { accept: 'application/json', AccessKey: accountKey, 'content-type': 'application/json' },
    method,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`)
  }
  return text ? (JSON.parse(text) as Json) : {}
}

const listItems = (payload: Json): Json[] => (Array.isArray(payload) ? payload : (payload.Items ?? []))

const dump = (label: string, value: Json): void => {
  if (dumpJson) {
    console.log(`\n--- ${label} ---\n${JSON.stringify(value, null, 2)}`)
  }
}

const hostnameOf = (pullZone: Json): string => {
  const fromList = Array.isArray(pullZone.Hostnames)
    ? pullZone.Hostnames.find((h: Json) => typeof h.Value === 'string')?.Value
    : undefined
  return fromList ?? `${pullZone.Name}.b-cdn.net`
}

const ensureStorageZone = async (name: string, s3: boolean): Promise<Json> => {
  const existing = listItems(await api('GET', '/storagezone?page=1&perPage=1000')).find((z) => z.Name === name)
  if (existing) {
    log.info(`storage zone "${name}" already exists (id ${existing.Id})`)
    return existing
  }
  if (dryRun) {
    log.info(`[dry-run] would create storage zone "${name}" (${region}${s3 ? ', S3' : ''})`)
    return { Id: 0, Name: name, Password: '<dry-run>' }
  }
  const created = await api('POST', '/storagezone', {
    Name: name,
    Region: region,
    ...(s3 ? { StorageZoneType: 1 } : {}),
  })
  log.success(`created storage zone "${name}" (id ${created.Id})`)
  dump('storagezone', created)
  return created
}

const ensurePullZone = async (name: string, storageZoneId: number, secure: boolean): Promise<Json> => {
  let zone = listItems(await api('GET', '/pullzone?page=1&perPage=1000')).find((z) => z.Name === name)
  if (!zone) {
    if (dryRun) {
      log.info(`[dry-run] would create pull zone "${name}" -> storage ${storageZoneId} (secure: ${secure})`)
      return { Hostnames: [{ Value: `${name}.b-cdn.net` }], Id: 0, Name: name, ZoneSecurityKey: '<dry-run>' }
    }
    zone = await api('POST', '/pullzone', {
      Name: name,
      OriginType: 2,
      StorageZoneId: storageZoneId,
      ZoneSecurityEnabled: secure,
    })
    log.success(`created pull zone "${name}" (id ${zone.Id})`)
  } else {
    log.info(`pull zone "${name}" already exists (id ${zone.Id})`)
  }

  if (secure && !dryRun) {
    zone = await api('GET', `/pullzone/${zone.Id}`)
    if (!zone.ZoneSecurityEnabled) {
      await api('POST', `/pullzone/${zone.Id}`, { ZoneSecurityEnabled: true })
      zone = await api('GET', `/pullzone/${zone.Id}`)
    }
  }
  dump('pullzone', zone)
  return zone
}

const ensureVideoLibrary = async (
  name: string,
  secure: boolean,
): Promise<{ hostname: string; library: Json; tokenKey?: string }> => {
  let library = listItems(await api('GET', '/videolibrary?page=1&perPage=1000')).find((l) => l.Name === name)
  if (!library) {
    if (dryRun) {
      log.info(`[dry-run] would create video library "${name}" (secure: ${secure})`)
      return {
        hostname: '<dry-run>',
        library: { ApiKey: '<dry-run>', Id: 0, Name: name },
        tokenKey: secure ? '<dry-run>' : undefined,
      }
    }
    library = await api('POST', '/videolibrary', { Name: name })
    log.success(`created video library "${name}" (id ${library.Id})`)
  } else {
    log.info(`video library "${name}" already exists (id ${library.Id})`)
  }
  dump('videolibrary', library)

  let hostname = ''
  let tokenKey: string | undefined
  const pullZoneId = library.PullZoneId
  if (typeof pullZoneId === 'number' && !dryRun) {
    try {
      let pz = await api('GET', `/pullzone/${pullZoneId}`)
      if (secure && !pz.ZoneSecurityEnabled) {
        await api('POST', `/pullzone/${pullZoneId}`, { ZoneSecurityEnabled: true })
        pz = await api('GET', `/pullzone/${pullZoneId}`)
      }
      hostname = hostnameOf(pz)
      tokenKey = secure ? pz.ZoneSecurityKey : undefined
      dump('videolibrary pullzone', pz)
    } catch (err) {
      log.warn(`could not read stream pull zone ${pullZoneId}: ${(err as Error).message}`)
      log.warn('read the hostname / token key from the Stream dashboard and fill the .env manually.')
    }
  }

  return { hostname, library, tokenKey }
}

const names = {
  storage: `${prefix}-store`,
  storageS3: `${prefix}-store-s3`,
  storageSigned: `${prefix}-store-sec`,
  stream: `${prefix}-stream`,
  streamSigned: `${prefix}-stream-sec`,
}

const main = async (): Promise<void> => {
  const tooLong = [names.storage, names.storageSigned, names.storageS3].filter((name) => name.length > 20)
  if (tooLong.length > 0) {
    log.error(
      `Storage zone names must be <= 20 characters (Bunny limit): ${tooLong.join(', ')}. Use a shorter --prefix.`,
    )
    process.exit(1)
  }

  log.header(`Provisioning Bunny test resources (prefix "${prefix}", region ${region})`)

  const storage = await ensureStorageZone(names.storage, false)
  const storagePz = await ensurePullZone(names.storage, storage.Id, false)

  const signedStorage = await ensureStorageZone(names.storageSigned, false)
  const signedStoragePz = await ensurePullZone(names.storageSigned, signedStorage.Id, true)

  const s3Storage = await ensureStorageZone(names.storageS3, true)
  const s3StoragePz = await ensurePullZone(names.storageS3, s3Storage.Id, false)

  const stream = await ensureVideoLibrary(names.stream, false)
  const signedStream = await ensureVideoLibrary(names.streamSigned, true)

  const lines = [
    `BUNNY_ACCOUNT_API_KEY=${accountKey}`,
    '',
    `BUNNY_STORAGE_ZONE_NAME=${storage.Name}`,
    `BUNNY_STORAGE_API_KEY=${storage.Password ?? ''}`,
    `BUNNY_STORAGE_HOSTNAME=${hostnameOf(storagePz)}`,
    '',
    `BUNNY_SIGNED_STORAGE_ZONE_NAME=${signedStorage.Name}`,
    `BUNNY_SIGNED_STORAGE_API_KEY=${signedStorage.Password ?? ''}`,
    `BUNNY_SIGNED_STORAGE_HOSTNAME=${hostnameOf(signedStoragePz)}`,
    `BUNNY_SIGNED_STORAGE_TOKEN_SECURITY_KEY=${signedStoragePz.ZoneSecurityKey ?? ''}`,
    '',
    `BUNNY_S3_STORAGE_ZONE_NAME=${s3Storage.Name}`,
    `BUNNY_S3_STORAGE_API_KEY=${s3Storage.Password ?? ''}`,
    `BUNNY_S3_STORAGE_HOSTNAME=${hostnameOf(s3StoragePz)}`,
    `BUNNY_S3_STORAGE_REGION=${region.toLowerCase()}`,
    '',
    `BUNNY_STREAM_LIBRARY_ID=${stream.library.Id}`,
    `BUNNY_STREAM_API_KEY=${stream.library.ApiKey ?? ''}`,
    `BUNNY_STREAM_HOSTNAME=${stream.hostname}`,
    '',
    `BUNNY_SIGNED_STREAM_LIBRARY_ID=${signedStream.library.Id}`,
    `BUNNY_SIGNED_STREAM_API_KEY=${signedStream.library.ApiKey ?? ''}`,
    `BUNNY_SIGNED_STREAM_HOSTNAME=${signedStream.hostname}`,
    `BUNNY_SIGNED_STREAM_TOKEN_SECURITY_KEY=${signedStream.tokenKey ?? ''}`,
    '',
    '# Deploy the Edge Script separately, then add:',
    '# BUNNY_EDGE_SCRIPT_URL=',
    '# BUNNY_EDGE_SECRET=',
  ]

  log.header('.env block')
  console.log(lines.join('\n'))
  if (dryRun) {
    log.info('dry run: nothing was created')
  }
}

main().catch((err) => {
  log.error(`Provisioning failed: ${(err as Error).message}`)
  process.exit(1)
})
