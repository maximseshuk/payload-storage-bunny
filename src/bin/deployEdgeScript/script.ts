import { randomBytes } from 'node:crypto'

import type { BinScript } from 'payload'

import { getBooleanFlag, getFlag, parseFlags } from '@/bin/flags.js'
import { EDGE_SCRIPT_SOURCE, EDGE_SCRIPT_VERSION } from '@/storage/clientUploads/edge/embedded.js'
import type { NormalizedBunnyStorageConfig } from '@/types/configNormalized.js'

import { checkEdgeScriptVersion, deployEdgeScript } from './core.js'

export const script: BinScript = async (config) => {
  /* eslint-disable no-console */
  const logger = {
    error: (message: string) => console.error(message),
    info: (message: string) => console.log(message),
    warn: (message: string) => console.warn(message),
  }
  /* eslint-enable no-console */

  const pluginCustom = config.custom?.['@seshuk/payload-storage-bunny'] as
    | { config?: NormalizedBunnyStorageConfig }
    | undefined
  const normalized = pluginCustom?.config

  if (!normalized?.storage) {
    logger.error('Bunny Storage is not configured; cannot deploy the Edge Script.')
    process.exit(1)
    return
  }

  const accountApiKey = getFlag(parseFlags(process.argv.slice(3)), 'api-key') ?? process.env.BUNNY_API_KEY
  if (!accountApiKey) {
    logger.error('Missing account API key. Pass --api-key or set BUNNY_API_KEY.')
    process.exit(1)
    return
  }

  const flags = parseFlags(process.argv.slice(3))

  if (getBooleanFlag(flags, 'check')) {
    const scriptUrl = getFlag(flags, 'script-url') ?? normalized.clientUploads?.edge?.scriptUrl ?? ''
    if (!scriptUrl) {
      logger.error('--check needs --script-url or clientUploads.edge.scriptUrl.')
      process.exit(1)
      return
    }
    const deployed = await checkEdgeScriptVersion(scriptUrl)
    logger.info(`bundled Edge Script version: ${EDGE_SCRIPT_VERSION}`)
    logger.info(`deployed Edge Script version: ${deployed ?? '(unknown — unreachable or pre-versioning)'}`)
    if (deployed === EDGE_SCRIPT_VERSION) {
      logger.info('Up to date.')
      return
    }
    logger.info('Outdated — run `npx payload bunny:deploy-edge-script` to update.')
    process.exit(1)
    return
  }

  const storage = normalized.storage
  const storageHost = storage.region ? `${storage.region}.storage.bunnycdn.com` : 'storage.bunnycdn.com'
  const cdnTier = getFlag(flags, 'cdn-tier') === 'standard' ? 'standard' : 'volume'
  const sharedSecret = normalized.clientUploads?.edge?.secret ?? randomBytes(16).toString('hex')

  try {
    const result = await deployEdgeScript({
      accountApiKey,
      allowedOrigins: getFlag(flags, 'allowed-origins'),
      cdnTier,
      code: EDGE_SCRIPT_SOURCE,
      connectionLimit: Number(getFlag(flags, 'connection-limit') ?? 10),
      dryRun: getBooleanFlag(flags, 'dry-run'),
      logger,
      name: getFlag(flags, 'name') ?? 'payload-storage-bunny-uploader',
      requestLimit: Number(getFlag(flags, 'request-limit') ?? 30),
      sharedSecret,
      skipHarden: getBooleanFlag(flags, 'skip-harden'),
      storageAccessKey: storage.apiKey,
      storageHost,
      storageZone: storage.zoneName,
    })

    logger.info(`Edge Script version: ${EDGE_SCRIPT_VERSION}`)
    if (result.scriptUrl) {
      logger.info('')
      logger.info('Add this to your bunnyStorage config:')
      logger.info('  clientUploads: {')
      logger.info(`    edge: { scriptUrl: '${result.scriptUrl}', secret: '${result.sharedSecret}' },`)
      logger.info('  }')
    }
  } catch (err) {
    logger.error(`${(err as Error).message}`)
    process.exit(1)
  }
}
