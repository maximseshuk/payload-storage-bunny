import fs from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath, parse } from 'node:url'

import nextEnv from '@next/env'
import next from 'next'

import { getSuiteDir } from './helpers/getSuiteDir.js'
import { initDev } from './helpers/initDev.js'
import { log } from './helpers/log.js'
import { startMongoMemoryServer, stopMongoMemoryServer } from './helpers/mongoMemoryServer.js'
import { findAvailablePort } from './helpers/server.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const suite = process.argv[2] || process.env.SUITE

if (!suite) {
  log.error('Usage: pnpm dev <suite>')
  log.info('Example: pnpm dev thumbnail')
  process.exit(1)
}

const shouldStartMemoryDB = process.argv.includes('--start-memory-db') || process.env.START_MEMORY_DB === 'true'

const enableTurbo = !process.argv.includes('--no-turbo')

const setupSuite = (suiteName: string) => {
  const suiteDir = getSuiteDir(suiteName)
  const symlinkPath = path.join(__dirname, 'payload.config.ts')
  const targetPath = path.join(suiteDir, 'payload.config.ts')

  try {
    fs.lstatSync(symlinkPath)
    fs.unlinkSync(symlinkPath)
  } catch {
    /* empty */
  }

  fs.symlinkSync(path.relative(__dirname, targetPath), symlinkPath)
  log.info(`Linked config → ${path.relative(__dirname, targetPath)}`)

  const nextCache = path.resolve(__dirname, '.next')
  if (fs.existsSync(nextCache)) {
    log.info('Cleaning .next cache...')
    fs.rmSync(nextCache, { recursive: true })
  }

  return { suiteConfigPath: targetPath, suiteDir, symlinkPath }
}

const startDev = async () => {
  log.header(`Dev Server: ${suite}`)
  log.info(enableTurbo ? 'Mode: Turbopack' : 'Mode: Webpack')
  log.info(shouldStartMemoryDB ? 'Database: Memory' : 'Database: External')

  const { suiteConfigPath } = setupSuite(suite)

  await initDev(projectRoot, suiteConfigPath)

  if (shouldStartMemoryDB) {
    const dbName = `payload-${suite}-${Date.now()}`
    await startMongoMemoryServer(dbName)
  }

  const requestedPort = parseInt(process.env.PORT || '3000', 10)
  const port = await findAvailablePort(requestedPort)

  process.env.PORT = String(port)
  process.env.SUITE = suite
  process.env.E2E_SERVER_PORT = String(port)
  process.env.E2E_SERVER_URL = `http://localhost:${port}`
  process.env.PAYLOAD_DROP_DATABASE = process.env.PAYLOAD_DROP_DATABASE === 'false' ? 'false' : 'true'

  if (enableTurbo) {
    process.env.TURBOPACK = '1'
  }

  // Forward environment to Next.js (important for env vars created after loadEnv)
  nextEnv.updateInitialEnv(process.env)

  // @ts-expect-error Next.js types
  const app = next({
    dev: true,
    dir: __dirname,
    hostname: 'localhost',
    port,
    turbo: enableTurbo,
    turbopack: enableTurbo,
  })

  const handle = app.getRequestHandler()

  let resolveServer: () => void
  const serverPromise = new Promise<void>((res) => (resolveServer = res))

  await app.prepare()

  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url || '', true)
    await handle(req, res, parsedUrl)
  }).listen(port, () => {
    resolveServer()
  })

  await serverPromise

  log.blank()
  log.ready(`http://localhost:${port}/admin`)
  log.info(`Suite: ${suite}`)
  log.blank()

  void fetch(`http://localhost:${port}/admin`)
  void fetch(`http://localhost:${port}/api/access`)

  let isCleaningUp = false

  const cleanup = async () => {
    if (isCleaningUp) {
      return
    }
    isCleaningUp = true

    log.header('Shutting down...')

    try {
      server.close()
      log.success('HTTP server closed')

      await app.close()
      log.success('Next.js closed')

      await stopMongoMemoryServer()
    } catch (error) {
      log.error(`Cleanup error: ${error instanceof Error ? error.message : String(error)}`)
    }

    process.exit(0)
  }

  process.on('SIGINT', () => void cleanup())
  process.on('SIGTERM', () => void cleanup())
}

startDev().catch((error) => {
  log.error(error.message)
  console.error(error)
  process.exit(1)
})
