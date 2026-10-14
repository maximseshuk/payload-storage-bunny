#!/usr/bin/env node
import { createRequire } from 'node:module'

import { cac } from 'cac'

import { runInit } from '@/cli/commands/init/run.js'

const pkg = createRequire(import.meta.url)('../../package.json') as { version: string }

const cli = cac('npx @seshuk/payload-storage-bunny')

cli
  .command('init', 'Interactive wizard that provisions Bunny resources and prints your plugin options + .env lines.')
  .option('--api-key <key>', 'Bunny account API key (else BUNNY_ACCOUNT_API_KEY env, else prompt).')
  .option('--dry-run', 'Show the plan without creating anything.')
  .action(async (options: { apiKey?: string; dryRun?: boolean }) => {
    await runInit({ apiKey: options.apiKey, dryRun: Boolean(options.dryRun), version: pkg.version })
  })

cli.help()
cli.version(pkg.version)

const main = async (): Promise<void> => {
  cli.parse(process.argv, { run: false })

  if (cli.options.help || cli.options.version) {
    return
  }

  if (!cli.matchedCommand) {
    if (cli.args.length === 0) {
      cli.outputHelp()
      return
    }
    process.stderr.write(`Unknown command "${cli.args[0]}".\n\n`)
    cli.outputHelp()
    process.exit(1)
    return
  }

  await cli.runMatchedCommand()
}

const describeError = (err: unknown): string => {
  if (err instanceof Error) {
    return err.message
  }
  if (typeof err === 'object' && err !== null) {
    try {
      return JSON.stringify(err) ?? String(err)
    } catch {
      return String(err)
    }
  }
  return String(err)
}

main().catch((err: unknown) => {
  const cause = err instanceof Error && err.cause !== undefined ? ` (cause: ${describeError(err.cause)})` : ''
  process.stderr.write(`${describeError(err)}${cause}\n`)
  process.exit(1)
})
