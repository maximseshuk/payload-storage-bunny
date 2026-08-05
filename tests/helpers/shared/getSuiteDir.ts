import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const testsDir = path.resolve(__dirname, '..', '..')

export const getSuiteDir = (suite: string): string => {
  const candidates = [path.join(testsDir, 'e2e', suite), path.join(testsDir, 'suites', suite)]
  const suiteDir = candidates.find((dir) => fs.existsSync(dir))

  if (!suiteDir) {
    throw new Error(`Test suite not found: ${suite}`)
  }

  const configPath = path.join(suiteDir, 'payload.config.ts')
  if (!fs.existsSync(configPath)) {
    throw new Error(`Suite config not found: ${configPath}`)
  }

  return suiteDir
}
