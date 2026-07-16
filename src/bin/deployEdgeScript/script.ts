import { randomBytes } from 'node:crypto'

import type { BinScript } from 'payload'

import { getBooleanFlag, getFlag, parseFlags } from '@/bin/flags.js'
import { EDGE_SCRIPT_SOURCE, EDGE_SCRIPT_VERSION } from '@/storage/clientUploads/edge/embedded.js'
import type { NormalizedBunnyStorageConfig } from '@/types/configNormalized.js'

import {
  buildEdgeDeployPlan,
  checkEdgeScriptVersion,
  deployEdgeScript,
  type EdgeDeployGroup,
  loadZonesFileGroup,
} from './core.js'
import { applyEnvFile, reloadNormalizedConfig } from './envFile.js'

const maskKey = (key: string): string => (key.length <= 4 ? '…' : `…${key.slice(-4)}`)

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
const paint = (code: string, text: string): string => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text)
const key = (text: string): string => paint('36', text)
const str = (text: string): string => paint('32', text)
const punc = (text: string): string => paint('2', text)

export const script: BinScript = async (config) => {
  /* eslint-disable no-console */
  const logger = {
    error: (message: string) => console.error(message),
    info: (message: string) => console.log(message),
    warn: (message: string) => console.warn(message),
  }
  /* eslint-enable no-console */

  const flags = parseFlags(process.argv.slice(3))
  const envFilePath = getFlag(flags, 'env-file')
  const zonesFilePath = getFlag(flags, 'zones-file')

  if (envFilePath && zonesFilePath) {
    logger.error('--env-file and --zones-file cannot be combined; use one or the other.')
    process.exit(1)
    return
  }

  const originalCustom = config.custom?.['@seshuk/payload-storage-bunny'] as
    | { config?: NormalizedBunnyStorageConfig }
    | undefined

  let normalized = originalCustom?.config

  if (envFilePath) {
    try {
      const { names } = applyEnvFile(envFilePath)
      logger.info(`Using env file: ${envFilePath} (${names.length} variables)`)
      normalized = await reloadNormalizedConfig()
    } catch (err) {
      logger.error((err as Error).message)
      process.exit(1)
      return
    }
  }

  if (!normalized) {
    logger.error('@seshuk/payload-storage-bunny is not configured; cannot deploy the Edge Script.')
    process.exit(1)
    return
  }

  const plan = buildEdgeDeployPlan(normalized)

  if (envFilePath && originalCustom?.config) {
    const originalPlan = buildEdgeDeployPlan(originalCustom.config)
    if (JSON.stringify(originalPlan) === JSON.stringify(plan)) {
      logger.warn(
        'The --env-file did not change the deploy plan — check that your Payload config reads these variables at its top level.',
      )
    }
  }

  const scriptUrls = [...new Set(plan.groups.map((g) => g.scriptUrl).filter((s): s is string => Boolean(s)))]

  if (getBooleanFlag(flags, 'check')) {
    if (!getFlag(flags, 'script-url') && scriptUrls.length > 1) {
      logger.error('Multiple distinct Edge Script URLs are configured; check them one at a time with --script-url:')
      for (const url of scriptUrls) {
        logger.error(`  ${url}`)
      }
      process.exit(1)
      return
    }
    const scriptUrl = getFlag(flags, 'script-url') ?? (scriptUrls.length === 1 ? scriptUrls[0] : undefined) ?? ''
    if (!scriptUrl) {
      logger.error('--check needs --script-url or storage.clientUploads.edge.scriptUrl.')
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
    logger.info(
      'This plugin version switches the script to a multi-zone ZONES env; redeploy AFTER the upgraded plugin is running in production (old mints do not carry the zone param).',
    )
    process.exit(1)
    return
  }

  const accountApiKey = getFlag(flags, 'api-key') ?? process.env.BUNNY_ACCOUNT_API_KEY
  if (!accountApiKey) {
    logger.error('Missing account API key. Pass --api-key or set BUNNY_ACCOUNT_API_KEY.')
    process.exit(1)
    return
  }

  let group: EdgeDeployGroup

  if (zonesFilePath) {
    try {
      group = loadZonesFileGroup(zonesFilePath)
    } catch (err) {
      logger.error((err as Error).message)
      process.exit(1)
      return
    }
  } else {
    if (plan.groups.length === 0) {
      for (const error of plan.errors) {
        logger.error(error)
      }
      process.exit(1)
      return
    }

    if (plan.groups.length === 1) {
      group = plan.groups[0]
    } else {
      const wantNew = getBooleanFlag(flags, 'new')
      const urlSelector = getFlag(flags, 'script-url')
      const selected = wantNew
        ? plan.groups.find((g) => g.scriptUrl === undefined)
        : urlSelector
          ? plan.groups.find((g) => g.scriptUrl === urlSelector)
          : undefined

      if (!selected) {
        logger.error(
          'Multiple Edge Script groups are configured; select one with --script-url <url> (or --new for zones not yet assigned to a script):',
        )
        for (const g of plan.groups) {
          logger.error(`  ${g.scriptUrl ?? '(unassigned)'} — zones: ${g.zoneNames.join(', ')}`)
        }
        process.exit(1)
        return
      }
      group = selected
    }

    if (group.secretConflict && !getFlag(flags, 'secret')) {
      logger.error(
        `storage zones [${group.zoneNames.join(', ')}] configure different \`clientUploads.edge.secret\` values; a shared Edge Script needs one secret — align them (or pass --secret to override)`,
      )
      process.exit(1)
      return
    }

    if (group.scriptUrl === undefined && group.sharedSecret === undefined) {
      logger.info(
        'No zone enables clientUploads yet — deploying for all non-s3 zones so you can wire the config afterwards.',
      )
    }
  }

  const cdnTier = getFlag(flags, 'cdn-tier') === 'standard' ? 'standard' : 'volume'
  const sharedSecret = getFlag(flags, 'secret') ?? group.sharedSecret ?? randomBytes(16).toString('hex')
  const name = getFlag(flags, 'name') ?? 'payload-storage-bunny-uploader'

  logger.info(`Deploying Edge Script "${name}" with account key ${maskKey(accountApiKey)}`)
  logger.info(`Target zones: ${group.zoneNames.join(', ')}`)

  try {
    const result = await deployEdgeScript({
      accountApiKey,
      allowedOrigins: getFlag(flags, 'allowed-origins'),
      cdnTier,
      code: EDGE_SCRIPT_SOURCE,
      connectionLimit: Number(getFlag(flags, 'connection-limit') ?? 10),
      dryRun: getBooleanFlag(flags, 'dry-run'),
      logger,
      name,
      requestLimit: Number(getFlag(flags, 'request-limit') ?? 30),
      sharedSecret,
      skipHarden: getBooleanFlag(flags, 'skip-harden'),
      zones: group.zones,
    })

    logger.info(`Edge Script version: ${EDGE_SCRIPT_VERSION}`)
    logger.info(`Serving zones: ${group.zoneNames.join(', ')}`)
    if (result.scriptUrl) {
      logger.info('')
      logger.info('Add this to storage.clientUploads of every non-s3 zone that enables client uploads')
      logger.info('(the same scriptUrl and secret are shared by all of them):')
      if (getBooleanFlag(flags, 'no-print-secret')) {
        logger.info(
          `  ${key('edge')}${punc(': { ')}${key('scriptUrl')}${punc(': ')}${str(`'${result.scriptUrl}'`)}${punc(', ')}${key('secret')}${punc(': ')}${str("'<hidden — --no-print-secret>'")}${punc(' },')}`,
        )
        logger.info('(secret withheld from output; read it from the script secrets in the Bunny dashboard if needed.)')
      } else {
        logger.info(
          `  ${key('edge')}${punc(': { ')}${key('scriptUrl')}${punc(': ')}${str(`'${result.scriptUrl}'`)}${punc(', ')}${key('secret')}${punc(': ')}${str(`'${result.sharedSecret}'`)}${punc(' },')}`,
        )
      }
      logger.info('')
      logger.info('After changing which zones use client uploads, re-run this command to refresh the ZONES map.')
    }
  } catch (err) {
    logger.error(`${(err as Error).message}`)
    process.exit(1)
  }
}
