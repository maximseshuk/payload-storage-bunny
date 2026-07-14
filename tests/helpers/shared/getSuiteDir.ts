import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const getSuiteDir = (suite: string): string => {
  const suiteDir = path.resolve(__dirname, '..', '..', 'suites', suite)

  if (!fs.existsSync(suiteDir)) {
    throw new Error(`Test suite not found: ${suite}`)
  }

  const configPath = path.join(suiteDir, 'payload.config.ts')
  if (!fs.existsSync(configPath)) {
    throw new Error(`Suite config not found: ${configPath}`)
  }

  return suiteDir
}
