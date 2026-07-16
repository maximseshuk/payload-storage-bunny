#!/usr/bin/env node
import { createRequire } from 'node:module'

import { cac } from 'cac'

import { runInit } from '@/bin/init/run.js'

const pkg = createRequire(import.meta.url)('../../package.json') as { version: string }

const cli = cac('npx @seshuk/payload-storage-bunny')

cli
  .command('init', 'Interactive wizard that provisions Bunny resources and prints your plugin config + .env lines.')
  .option('--api-key <key>', 'Bunny account API key (else BUNNY_ACCOUNT_API_KEY env, else prompt).')
  .option('--dry-run', 'Show the plan without creating anything.')
  .action(async (options: { apiKey?: string; dryRun?: boolean }) => {
    await runInit({ apiKey: options.apiKey, dryRun: Boolean(options.dryRun) })
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

main().catch((err: unknown) => {
  process.stderr.write(`${(err as Error).message}\n`)
  process.exit(1)
})
