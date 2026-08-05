import { cancel, confirm, intro, isCancel, log, note, outro, password, spinner } from '@clack/prompts'

import { appendEnvLines } from '@/cli/lib/envFile.js'
import type { Logger } from '@/cli/lib/logger.js'

import type { InitPlan } from '../../lib/plan.js'
import { buildInitPlan, PRICING, PRICING_NOTE } from '../../lib/plan.js'
import type { EdgeProvisionInput, Ledger, PreflightResult } from '../../lib/provision.js'
import { createLedger, preflightInit, provisionInit } from '../../lib/provision.js'
import { buildInitOutput } from './output.js'
import { resolveAccountApiKey, runWizard } from './wizard.js'

const logger: Logger = { error: log.error, info: log.info, warn: log.warn }

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
const paint = (code: string, text: string): string => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text)
const bold = (text: string): string => paint('1', text)
const dim = (text: string): string => paint('2', text)
const green = (text: string): string => paint('32', text)
const cyan = (text: string): string => paint('36', text)
const yellow = (text: string): string => paint('33', text)
const gray = (text: string): string => paint('90', text)

const TYPE_WIDTH = 13
const DETAIL_INDENT = '             '

const tagCell = (disposition: 'create' | 'reuse' | 'update'): string => {
  if (disposition === 'reuse') {
    return gray('REUSE'.padEnd(6))
  }
  if (disposition === 'update') {
    return cyan('UPDATE'.padEnd(6))
  }
  return green('CREATE'.padEnd(6))
}

const resourceLine = (disposition: 'create' | 'reuse' | 'update', type: string, name: string, extra = ''): string =>
  `  ${tagCell(disposition)}   ${type.padEnd(TYPE_WIDTH)} ${bold(`"${name}"`)}${extra}`

const detailLine = (details: string[]): string => `${DETAIL_INDENT}${dim(details.join(' · '))}`

const buildPlanSummary = (plan: InitPlan, preflight: PreflightResult): string => {
  const lines: string[] = []

  let hasReplication = false

  if (plan.storage) {
    const details = [
      plan.storage.s3 ? 'S3' : 'HTTP',
      plan.storage.ssd ? 'Edge/SSD' : 'Standard',
      plan.storage.ssd ? 'region DE (fixed)' : `region ${plan.storage.region}`,
    ]
    if (plan.storage.secure) {
      details.push('token auth')
    }
    if (plan.storage.replication.length > 0) {
      details.push(`replication: ${plan.storage.replication.join(', ')}`)
      hasReplication = true
    }
    lines.push(resourceLine(preflight.storage ?? 'create', 'Storage zone', plan.storage.zoneName))
    lines.push(detailLine(details))
    const pullDisposition =
      plan.storage.optimizer && preflight.storagePullZone === 'reuse'
        ? 'update'
        : (preflight.storagePullZone ?? 'create')
    lines.push(
      resourceLine(
        pullDisposition,
        'Pull zone',
        plan.storage.zoneName,
        plan.storage.optimizer ? dim(`  — Optimizer (${PRICING.optimizerMonthly})`) : '',
      ),
    )
    if (plan.storage.deployEdge) {
      lines.push(
        resourceLine(
          preflight.edgeScript === 'reuse' ? 'update' : 'create',
          'Edge Script',
          'payload-storage-bunny-uploader',
          dim('  — client uploads (extra Bunny cost)'),
        ),
      )
    }
  }

  if (plan.stream) {
    const details = ['region DE (fixed)', 'CDN-direct']
    if (plan.stream.secure) {
      details.push('token auth')
    }
    if (plan.stream.replication.length > 0) {
      details.push(`replication: ${plan.stream.replication.join(', ')}`)
      hasReplication = true
    }
    lines.push(resourceLine(preflight.stream ?? 'create', 'Video library', plan.stream.libraryName))
    lines.push(detailLine(details))
  }

  lines.push('')
  lines.push(dim('These resources are billable. Nothing is ever deleted.'))
  if (plan.storage?.optimizer) {
    lines.push(yellow(`${bold('⚠')} Bunny Optimizer is a paid add-on: flat ${PRICING.optimizerMonthly}.`))
  }
  if (hasReplication) {
    lines.push(
      yellow(
        `${bold('⚠')} Replication regions can't be removed later — the zone must be deleted & recreated to change them.`,
      ),
    )
  }
  lines.push(dim(PRICING_NOTE))
  return lines.join('\n')
}

const printLedger = (ledger: Ledger): void => {
  if (ledger.created.length === 0 && ledger.reused.length === 0) {
    logger.info('No resources were created before the failure.')
    return
  }
  for (const entry of ledger.created) {
    logger.info(`Created so far: ${entry.kind} "${entry.name}" (id ${entry.id})`)
  }
  for (const entry of ledger.reused) {
    logger.info(`Reused: ${entry.kind} "${entry.name}" (id ${entry.id})`)
  }
}

const renderOutput = (envBlock: string, configBlock: string): string =>
  [
    'Environment variables (add to your .env):',
    '',
    envBlock,
    '',
    'Plugin config (paste into payload.config.ts):',
    '',
    configBlock,
  ].join('\n')

export const runInit = async (options: { apiKey?: string; dryRun?: boolean } = {}): Promise<void> => {
  const dryRun = Boolean(options.dryRun)

  if (!process.stdout.isTTY) {
    logger.error('bunny init is interactive; run it in a terminal.')
    process.exit(1)
    return
  }

  intro('bunny init — set up Bunny resources for @seshuk/payload-storage-bunny')
  note(
    'This wizard can create billable resources in your Bunny account.\nNothing is created until you confirm.',
    'Heads up',
  )

  const accountApiKey = await resolveAccountApiKey(options.apiKey, logger)
  const answers = await runWizard(accountApiKey)
  const plan = buildInitPlan(answers)

  const preSpinner = spinner()
  preSpinner.start('Checking your Bunny account for existing resources…')
  let preflight: PreflightResult
  try {
    preflight = await preflightInit(accountApiKey, plan)
    preSpinner.stop('Pre-flight check complete.')
  } catch (err) {
    preSpinner.stop('Pre-flight check failed.')
    logger.error((err as Error).message)
    process.exit(1)
    return
  }

  note(buildPlanSummary(plan, preflight), 'About to create in your Bunny account')

  if (preflight.issues.length > 0) {
    for (const issue of preflight.issues) {
      logger.error(issue.message)
    }
    cancel('Resolve the naming conflicts above and re-run.')
    process.exit(1)
    return
  }

  if (dryRun) {
    outro('Dry run — nothing was created. Re-run without --dry-run to provision.')
    return
  }

  const go = await confirm({ initialValue: false, message: 'Create these resources now?' })
  if (isCancel(go) || !go) {
    cancel('Cancelled — nothing was created.')
    process.exit(0)
    return
  }

  let edgeInput: EdgeProvisionInput | undefined
  if (plan.storage?.deployEdge) {
    edgeInput = { reuseScript: preflight.edgeScript === 'reuse' }
    if (preflight.edgeScript === 'reuse') {
      const provided = await password({
        message:
          "An Edge Script 'payload-storage-bunny-uploader' already exists. Enter its shared secret (the edge.secret / BUNNY_EDGE_SECRET from your existing config) to add this zone to it, or leave blank to skip.",
      })
      if (!isCancel(provided) && String(provided).trim().length > 0) {
        edgeInput = { reuseScript: true, sharedSecret: String(provided).trim() }
      }
    }
  }

  const ledger = createLedger()
  const provisionSpinner = spinner()
  provisionSpinner.start('Provisioning…')

  try {
    const result = await provisionInit({
      accountApiKey,
      edge: edgeInput,
      ledger,
      logger,
      onStep: (message) => provisionSpinner.message(message),
      plan,
    })
    provisionSpinner.stop('Provisioning complete.')

    const output = buildInitOutput(answers, result, accountApiKey)
    for (const warning of output.warnings) {
      logger.warn(warning)
    }
    const envBlock = output.env.map((entry) => `${entry.name}=${entry.value}`).join('\n')
    note(renderOutput(envBlock, output.configBlock), 'Your configuration')

    const doAppend = await confirm({ initialValue: false, message: 'Append these lines to ./.env?' })
    if (!isCancel(doAppend) && doAppend) {
      const appendResult = appendEnvLines('.env', output.env)
      if (appendResult.appended.length > 0) {
        logger.info(
          `${appendResult.created ? 'Created' : 'Updated'} ${appendResult.filePath} (+${appendResult.appended.length} variable${appendResult.appended.length === 1 ? '' : 's'}).`,
        )
      }
      if (appendResult.skipped.length > 0) {
        logger.warn(`Kept existing values for: ${appendResult.skipped.join(', ')} (not overwritten).`)
      }
    }
  } catch (err) {
    provisionSpinner.stop('Provisioning failed.')
    logger.error((err as Error).message)
    printLedger(ledger)
    logger.info('Re-running bunny init with the same names is safe — every step reuses existing resources.')
    process.exit(1)
    return
  }

  outro('Done — paste the plugin block into payload.config.ts and restart. See /cli/init for details.')
}
