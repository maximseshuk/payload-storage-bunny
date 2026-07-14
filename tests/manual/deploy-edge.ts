import { randomBytes } from 'node:crypto'

import { checkEdgeScriptVersion, deployEdgeScript } from '../../src/bin/deployEdgeScript/core.js'
import { getBooleanFlag, getFlag, parseFlags } from '../../src/bin/flags.js'
import { EDGE_SCRIPT_SOURCE, EDGE_SCRIPT_VERSION } from '../../src/storage/clientUploads/edge/embedded.js'
import { log } from '../helpers/shared/log.js'

const flags = parseFlags(process.argv.slice(2))

const accountKey = getFlag(flags, 'api-key') ?? process.env.BUNNY_API_KEY ?? ''
const zoneName = getFlag(flags, 'storage-zone') ?? process.env.BUNNY_STORAGE_ZONE_NAME ?? ''
const zoneKey = getFlag(flags, 'storage-key') ?? process.env.BUNNY_STORAGE_API_KEY ?? ''
const storageHost = getFlag(flags, 'storage-host') ?? 'storage.bunnycdn.com'
const secret = getFlag(flags, 'secret') ?? process.env.BUNNY_EDGE_SECRET ?? randomBytes(16).toString('hex')

if (!accountKey || !zoneName || !zoneKey) {
  log.error('Missing BUNNY_API_KEY, BUNNY_STORAGE_ZONE_NAME, or BUNNY_STORAGE_API_KEY (or the matching flags).')
  process.exit(1)
}

const main = async (): Promise<void> => {
  if (getBooleanFlag(flags, 'check')) {
    const scriptUrl = getFlag(flags, 'script-url') ?? process.env.BUNNY_EDGE_SCRIPT_URL ?? ''
    if (!scriptUrl) {
      log.error('--check needs --script-url or BUNNY_EDGE_SCRIPT_URL.')
      process.exit(1)
    }
    const deployed = await checkEdgeScriptVersion(scriptUrl)
    log.info(`bundled version: ${EDGE_SCRIPT_VERSION}`)
    log.info(`deployed version: ${deployed ?? '(unknown — script unreachable or pre-versioning)'}`)
    if (deployed === EDGE_SCRIPT_VERSION) {
      log.success('up to date')
      process.exit(0)
    }
    log.warn('outdated — run `pnpm test:deploy-edge` (or `npx payload bunny:deploy-edge-script`) to update')
    process.exit(1)
  }

  const result = await deployEdgeScript({
    accountApiKey: accountKey,
    allowedOrigins: getFlag(flags, 'allowed-origins'),
    cdnTier: getFlag(flags, 'cdn-tier') === 'standard' ? 'standard' : 'volume',
    code: EDGE_SCRIPT_SOURCE,
    connectionLimit: Number(getFlag(flags, 'connection-limit') ?? 10),
    dryRun: getBooleanFlag(flags, 'dry-run'),
    logger: log,
    name: getFlag(flags, 'name') ?? 'payload-storage-bunny-uploader',
    requestLimit: Number(getFlag(flags, 'request-limit') ?? 30),
    sharedSecret: secret,
    skipHarden: getBooleanFlag(flags, 'skip-harden'),
    storageAccessKey: zoneKey,
    storageHost,
    storageZone: zoneName,
  })

  log.success(`edge script deployed (version ${EDGE_SCRIPT_VERSION})`)
  log.header('.env additions')
  console.log(`BUNNY_EDGE_SCRIPT_URL=${result.scriptUrl}`)
  console.log(`BUNNY_EDGE_SECRET=${result.sharedSecret}`)
}

main().catch((err) => {
  log.error(`Edge Script deploy failed: ${(err as Error).message}`)
  process.exit(1)
})
