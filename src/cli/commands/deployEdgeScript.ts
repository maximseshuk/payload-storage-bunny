import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'

import { cac, type CAC } from 'cac'
import type { BinScript } from 'payload'
import { findConfig } from 'payload/node'

import { applyEnvFile } from '@/cli/lib/envFile.js'
import type { Logger } from '@/cli/lib/logger.js'
import { EDGE_SCRIPT_SOURCE, EDGE_SCRIPT_VERSION } from '@/server/payload/storage/clientUploads/embedded.js'
import { PLUGIN_KEY } from '@/shared/constants.js'
import type { NormalizedBunnyStorageConfig } from '@/shared/types/configNormalized.js'

import {
  buildEdgeDeployPlan,
  checkEdgeScriptVersion,
  deployEdgeScript,
  type EdgeDeployGroup,
  loadZonesFileGroup,
} from '../lib/deployEdgeScript.js'

/* eslint-disable no-console */
const logger: Logger = { error: console.error, info: console.log, warn: console.warn }
/* eslint-enable no-console */

let reloadCounter = 0

export const reloadNormalizedConfig = async (): Promise<NormalizedBunnyStorageConfig> => {
  const configPath = findConfig()
  const url = `${pathToFileURL(configPath).href}?psb-env-reload=${String(++reloadCounter)}`

  const imported = (await import(url)) as { default: unknown }
  const resolved = (await imported.default) as { custom?: Record<string, unknown> }

  const pluginCustom = resolved.custom?.[PLUGIN_KEY] as { config?: NormalizedBunnyStorageConfig } | undefined
  if (!pluginCustom?.config) {
    throw new Error(
      `reloaded Payload config does not include the ${PLUGIN_KEY} plugin; cannot rebuild the deploy plan from --env-file`,
    )
  }

  return pluginCustom.config
}

const maskKey = (key: string): string => (key.length <= 4 ? '…' : `…${key.slice(-4)}`)

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
const paint = (code: string, text: string): string => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text)
const key = (text: string): string => paint('36', text)
const str = (text: string): string => paint('32', text)
const punc = (text: string): string => paint('2', text)

const asString = (value: unknown): string | undefined => (value === undefined ? undefined : String(value))

export const buildDeployCli = (): CAC => {
  const cli = cac('payload bunny:deploy-edge-script')
  cli.option('--api-key <key>', 'Bunny account API key (defaults to BUNNY_ACCOUNT_API_KEY; resolved after --env-file).')
  cli.option('--env-file <path>', 'Load this env file (override semantics) and rebuild the deploy plan from it.')
  cli.option('--zones-file <path>', 'Config-free deploy: take the zone map from a JSON file.')
  cli.option('--secret <secret>', 'Explicit shared secret for the script (overrides the configured or generated one).')
  cli.option('--script-url <url>', 'Inspect this URL with --check; also selects a deploy group when several exist.')
  cli.option('--name <name>', 'Edge Script name (default: payload-storage-bunny-uploader).')
  cli.option('--cdn-tier <tier>', 'Pull Zone tier: standard or volume (default: volume).')
  cli.option('--allowed-origins <origins>', 'Comma-separated origins allowed to call the script (CORS).')
  cli.option('--connection-limit <n>', "Per-IP connection limit on the script's Pull Zone (default: 10).")
  cli.option('--request-limit <n>', "Per-IP request limit on the script's Pull Zone (default: 30).")
  cli.option('--check', 'Compare deployed vs. bundled script version instead of deploying.')
  cli.option('--new', 'Select the unassigned group (zones not yet on a script) when several groups exist.')
  cli.option('--dry-run', 'Print what would be deployed without making changes.')
  cli.option('--no-print-secret', 'Omit the cleartext shared secret from the success output.')
  cli.option('--no-prune', "Additive deploy: upsert this deploy's ZONE_* secrets only, without removing others.")
  cli.option('--skip-harden', 'Skip the Pull Zone hardening step (rate limits, origin rules).')
  cli.help()
  return cli
}

export const script: BinScript = async (config) => {
  const cli = buildDeployCli()
  cli.parse(['', '', ...process.argv.slice(3)], { run: false })
  if (cli.options.help) {
    return
  }
  const options = cli.options

  const envFilePath = asString(options.envFile)
  const zonesFilePath = asString(options.zonesFile)

  if (envFilePath && zonesFilePath) {
    logger.error('--env-file and --zones-file cannot be combined; use one or the other.')
    process.exit(1)
    return
  }

  const originalCustom = config.custom?.[PLUGIN_KEY] as { config?: NormalizedBunnyStorageConfig } | undefined

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

  if (options.check) {
    if (!asString(options.scriptUrl) && scriptUrls.length > 1) {
      logger.error('Multiple distinct Edge Script URLs are configured; check them one at a time with --script-url:')
      for (const url of scriptUrls) {
        logger.error(`  ${url}`)
      }
      process.exit(1)
      return
    }
    const scriptUrl = asString(options.scriptUrl) ?? (scriptUrls.length === 1 ? scriptUrls[0] : undefined) ?? ''
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
    process.exit(1)
    return
  }

  const accountApiKey = asString(options.apiKey) ?? process.env.BUNNY_ACCOUNT_API_KEY
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
      const wantNew = Boolean(options.new)
      const urlSelector = asString(options.scriptUrl)
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

    if (group.secretConflict && !asString(options.secret)) {
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

  const cdnTier = asString(options.cdnTier) === 'standard' ? 'standard' : 'volume'
  const sharedSecret = asString(options.secret) ?? group.sharedSecret ?? randomBytes(16).toString('hex')
  const name = asString(options.name) ?? 'payload-storage-bunny-uploader'

  logger.info(`Deploying Edge Script "${name}" with account key ${maskKey(accountApiKey)}`)
  logger.info(`Target zones: ${group.zoneNames.join(', ')}`)

  try {
    const result = await deployEdgeScript({
      accountApiKey,
      additive: !options.prune,
      allowedOrigins: asString(options.allowedOrigins),
      cdnTier,
      code: EDGE_SCRIPT_SOURCE,
      connectionLimit: Number(options.connectionLimit ?? 10),
      dryRun: Boolean(options.dryRun),
      logger,
      name,
      requestLimit: Number(options.requestLimit ?? 30),
      sharedSecret,
      skipHarden: Boolean(options.skipHarden),
      zones: group.zones,
    })

    logger.info(`Edge Script version: ${EDGE_SCRIPT_VERSION}`)
    logger.info(`Serving zones: ${group.zoneNames.join(', ')}`)
    if (result.scriptUrl) {
      logger.info('')
      logger.info('Add this to storage.clientUploads of every non-s3 zone that enables client uploads')
      logger.info('(the same scriptUrl and secret are shared by all of them):')
      if (!options.printSecret) {
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
      logger.info(
        'After changing which zones use client uploads, re-run this command to sync the per-zone secrets (it adds new zones and removes stale ones).',
      )
    }
  } catch (err) {
    logger.error(`${(err as Error).message}`)
    process.exit(1)
  }
}
