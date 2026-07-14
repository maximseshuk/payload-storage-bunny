import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import nextEnv from '@next/env'
import type { SanitizedConfig } from 'payload'
import { generateImportMap } from 'payload'

import { log } from '../shared/log.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const ROOT_DIR = path.resolve(__dirname, '..', '..')

const importMapPath = path.join(ROOT_DIR, 'app/(payload)/admin/importMap.js')

export const initDev = async (projectRoot: string, suiteConfigPath: string): Promise<void> => {
  nextEnv.loadEnvConfig(projectRoot)

  process.env.TURBOPACK = '1'
  process.env.ROOT_DIR = ROOT_DIR

  if (!process.env.NODE_ENV) {
    ;(process.env as { NODE_ENV: string }).NODE_ENV = 'development'
  }

  const dir = path.dirname(importMapPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(importMapPath, 'export const importMap = {}\n')

  log.info('Generating import map...')
  const configUrl = pathToFileURL(suiteConfigPath).href
  const config: SanitizedConfig = await (await import(configUrl)).default

  await generateImportMap(config, { force: true, log: true })
}
