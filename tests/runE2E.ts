import type { ChildProcess } from 'node:child_process'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { findAvailablePort, waitForServer } from './helpers/e2e/server.js'
import { log } from './helpers/shared/log.js'
import { killProcessGroup } from './helpers/shared/process.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const suitesDir = path.join(__dirname, 'suites')

const hasE2ETests = (suiteDir: string): boolean => {
  const files = fs.readdirSync(suiteDir)
  return files.some((file) => file.endsWith('e2e.ts'))
}

const getAvailableSuites = (): string[] => {
  if (!fs.existsSync(suitesDir)) {
    return []
  }
  return fs
    .readdirSync(suitesDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .filter((name) => {
      const suiteDir = path.join(suitesDir, name)
      const configPath = path.join(suiteDir, 'payload.config.ts')
      return fs.existsSync(configPath) && hasE2ETests(suiteDir)
    })
}

const args = process.argv.slice(2)
const availableSuites = getAvailableSuites()

if (args.includes('--help') || args.includes('-h')) {
  log.header('E2E Test Runner')
  log.blank()
  log.info('Usage: pnpm test:e2e [suite] [options]')
  log.blank()
  console.log('  Options:')
  console.log('    --ui          Run in Playwright UI mode')
  console.log('    --help, -h    Show this help')
  log.blank()
  console.log('  Available suites:')
  availableSuites.forEach((suite) => console.log(`    • ${suite}`))
  log.blank()
  console.log('  Examples:')
  console.log('    pnpm test:e2e              # Run all suites')
  console.log('    pnpm test:e2e thumbnail    # Run specific suite')
  console.log('    pnpm test:e2e --ui thumb   # UI mode for suite')
  log.blank()
  process.exit(0)
}

const uiMode = process.env.UI_MODE === '1' || args.includes('--ui')
const suiteArg = args.find((arg) => !arg.startsWith('--'))

if (availableSuites.length === 0) {
  log.error('No test suites found in tests/suites/')
  process.exit(1)
}

let suitesToRun: string[] = []

if (suiteArg) {
  if (!availableSuites.includes(suiteArg)) {
    log.error(`Suite "${suiteArg}" not found`)
    log.info(`Available: ${availableSuites.join(', ')}`)
    process.exit(1)
  }
  suitesToRun = [suiteArg]
} else if (uiMode) {
  log.error('UI mode requires a specific suite')
  log.info(`Available: ${availableSuites.join(', ')}`)
  process.exit(1)
} else {
  suitesToRun = availableSuites
}

interface TestResult {
  code: number
  suite: string
}

let serverProcess: ChildProcess | null = null

const runSuite = async (suite: string, isUIMode: boolean): Promise<TestResult> => {
  log.header(`Suite: ${suite}`)

  const port = await findAvailablePort(3000)

  try {
    log.info('Starting test server...')

    serverProcess = spawn('pnpm', ['runts', 'tests/dev.ts', suite, '--start-memory-db'], {
      cwd: projectRoot,
      detached: true,
      env: {
        ...process.env,
        PORT: String(port),
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    })

    log.info(`Waiting for server on port ${port}...`)
    const serverReady = await waitForServer(port)

    if (!serverReady) {
      log.error('Server failed to start within timeout')
      return { code: 1, suite }
    }

    log.blank()

    const playwrightBin = path.resolve(projectRoot, 'node_modules/.bin/playwright')
    const playwrightConfig = path.resolve(__dirname, 'playwright.config.ts')
    const testPath = `suites/${suite}/`

    const args = ['test', '-c', playwrightConfig, ...(isUIMode ? ['--ui'] : []), testPath]

    log.info(`Running: playwright ${args.join(' ')}`)
    log.blank()

    const result = spawnSync(playwrightBin, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        E2E_SERVER_PORT: String(port),
        E2E_SERVER_URL: `http://localhost:${port}`,
        E2E_SUITE_NAME: suite,
      },
      stdio: 'inherit',
    })

    const code = result.status ?? 1

    if (!isUIMode) {
      if (code === 0) {
        log.success(`Suite "${suite}" passed`)
      } else {
        log.error(`Suite "${suite}" failed`)
      }
    }

    return { code, suite }
  } finally {
    if (serverProcess) {
      await killProcessGroup(serverProcess)
      serverProcess = null
    }
  }
}

const main = async () => {
  log.header('E2E Test Runner')
  log.info(`Running ${suitesToRun.length} suite(s): ${suitesToRun.join(', ')}`)

  if (uiMode) {
    await runSuite(suitesToRun[0], true)
    process.exit(0)
  }

  const results: TestResult[] = []

  for (const suite of suitesToRun) {
    const result = await runSuite(suite, false)
    results.push(result)

    if (result.code !== 0 && suitesToRun.length === 1) {
      break
    }
  }

  log.header('Results')

  const passed = results.filter((r) => r.code === 0)
  const failed = results.filter((r) => r.code !== 0)

  results.forEach((r) => {
    if (r.code === 0) {
      log.success(`${r.suite} passed`)
    } else {
      log.error(`${r.suite} failed`)
    }
  })

  log.blank()
  log.divider()

  if (failed.length === 0) {
    log.success(`All ${passed.length} suite(s) passed`)
  } else {
    log.error(`${failed.length}/${results.length} suite(s) failed`)
  }

  log.blank()
  process.exit(failed.length > 0 ? 1 : 0)
}

process.once('SIGINT', () => {
  if (serverProcess) {
    void killProcessGroup(serverProcess).then(() => process.exit(0))
  } else {
    process.exit(0)
  }
})

process.once('SIGTERM', () => {
  if (serverProcess) {
    void killProcessGroup(serverProcess).then(() => process.exit(0))
  } else {
    process.exit(0)
  }
})

main().catch((error) => {
  log.error(error.message)
  process.exit(1)
})
