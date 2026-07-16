import { randomBytes } from 'node:crypto'

import { cac } from 'cac'

import { checkEdgeScriptVersion, deployEdgeScript } from '../../src/bin/deployEdgeScript/core.js'
import { EDGE_SCRIPT_SOURCE, EDGE_SCRIPT_VERSION } from '../../src/storage/clientUploads/edge/embedded.js'
import { log } from '../helpers/shared/log.js'

const arg = (value: unknown): string | undefined => (value === undefined ? undefined : String(value))
const asArray = (value: unknown): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [String(value)]

const cli = cac('pnpm test:deploy-edge')
cli.option('--api-key <key>', 'Bunny account API key (defaults to BUNNY_ACCOUNT_API_KEY).')
cli.option('--storage-zone <name>', 'Single storage zone name (defaults to BUNNY_STORAGE_ZONE_NAME).')
cli.option('--storage-key <key>', 'Storage zone password (defaults to BUNNY_STORAGE_API_KEY).')
cli.option('--storage-host <host>', 'Storage host (default: storage.bunnycdn.com).')
cli.option('--zone <name:key:host>', 'Add a zone (repeatable); overrides the single-zone flags.')
cli.option('--secret <secret>', 'Shared secret (defaults to BUNNY_EDGE_SECRET or a random one).')
cli.option('--script-url <url>', 'Script URL to inspect with --check.')
cli.option('--name <name>', 'Edge Script name (default: payload-storage-bunny-uploader).')
cli.option('--cdn-tier <tier>', 'Pull Zone tier: standard or volume (default: volume).')
cli.option('--allowed-origins <origins>', 'Comma-separated CORS origins.')
cli.option('--connection-limit <n>', 'Per-IP connection limit (default: 10).')
cli.option('--request-limit <n>', 'Per-IP request limit (default: 30).')
cli.option('--check', 'Compare deployed vs. bundled version instead of deploying.')
cli.option('--dry-run', 'Print what would be deployed without making changes.')
cli.option('--skip-harden', 'Skip Pull Zone hardening.')
cli.help()
cli.parse(['', '', ...process.argv.slice(2)], { run: false })
if (cli.options.help) {
  process.exit(0)
}
const options = cli.options

const accountKey = arg(options.apiKey) ?? process.env.BUNNY_ACCOUNT_API_KEY ?? ''
const zoneName = arg(options.storageZone) ?? process.env.BUNNY_STORAGE_ZONE_NAME ?? ''
const zoneKey = arg(options.storageKey) ?? process.env.BUNNY_STORAGE_API_KEY ?? ''
const storageHost = arg(options.storageHost) ?? 'storage.bunnycdn.com'
const secret = arg(options.secret) ?? process.env.BUNNY_EDGE_SECRET ?? randomBytes(16).toString('hex')

const zones: Record<string, { accessKey: string; host: string }> = {}
for (const spec of asArray(options.zone)) {
  const [name, accessKey, host] = spec.split(':')
  if (name && accessKey) {
    zones[name] = { accessKey, host: host || 'storage.bunnycdn.com' }
  }
}

if (Object.keys(zones).length === 0) {
  if (!accountKey || !zoneName || !zoneKey) {
    log.error(
      'Missing BUNNY_ACCOUNT_API_KEY, BUNNY_STORAGE_ZONE_NAME, or BUNNY_STORAGE_API_KEY (or the matching flags).',
    )
    process.exit(1)
  }
  zones[zoneName] = { accessKey: zoneKey, host: storageHost }
} else if (!accountKey) {
  log.error('Missing BUNNY_ACCOUNT_API_KEY (or --api-key).')
  process.exit(1)
}

const main = async (): Promise<void> => {
  if (options.check) {
    const scriptUrl = arg(options.scriptUrl) ?? process.env.BUNNY_EDGE_SCRIPT_URL ?? ''
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
    allowedOrigins: arg(options.allowedOrigins),
    cdnTier: arg(options.cdnTier) === 'standard' ? 'standard' : 'volume',
    code: EDGE_SCRIPT_SOURCE,
    connectionLimit: Number(arg(options.connectionLimit) ?? 10),
    dryRun: Boolean(options.dryRun),
    logger: log,
    name: arg(options.name) ?? 'payload-storage-bunny-uploader',
    requestLimit: Number(arg(options.requestLimit) ?? 30),
    sharedSecret: secret,
    skipHarden: Boolean(options.skipHarden),
    zones,
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
