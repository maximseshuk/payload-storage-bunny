import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

import { findConfig } from 'payload/node'

import type { NormalizedBunnyStorageConfig } from '@/types/configNormalized.js'

const PLUGIN_KEY = '@seshuk/payload-storage-bunny'

export const applyEnvFile = (filePath: string): { names: string[] } => {
  const resolved = path.resolve(process.cwd(), filePath)

  let contents: string
  try {
    contents = readFileSync(resolved, 'utf8')
  } catch (err) {
    throw new Error(`could not read env file "${resolved}": ${(err as Error).message}`, { cause: err })
  }

  const parsed = parseEnv(contents) as Record<string, string>
  Object.assign(process.env, parsed)

  return { names: Object.keys(parsed) }
}

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
