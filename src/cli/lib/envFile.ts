import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'

export type EnvEntry = {
  name: string
  value: string
}

export type AppendEnvResult = {
  appended: string[]
  created: boolean
  filePath: string
  skipped: string[]
}

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

export const appendEnvLines = (filePath: string, entries: EnvEntry[]): AppendEnvResult => {
  const resolved = path.resolve(process.cwd(), filePath)
  const exists = existsSync(resolved)

  const existingNames = new Set<string>()
  let current = ''
  if (exists) {
    current = readFileSync(resolved, 'utf8')
    const parsed = parseEnv(current) as Record<string, string>
    for (const name of Object.keys(parsed)) {
      existingNames.add(name)
    }
  }

  const appended: string[] = []
  const skipped: string[] = []
  const newLines: string[] = []
  for (const entry of entries) {
    if (existingNames.has(entry.name)) {
      skipped.push(entry.name)
      continue
    }
    existingNames.add(entry.name)
    appended.push(entry.name)
    newLines.push(`${entry.name}=${entry.value}`)
  }

  if (newLines.length > 0) {
    let next = current
    if (next.length > 0 && !next.endsWith('\n')) {
      next += '\n'
    }
    next += `${newLines.join('\n')}\n`
    writeFileSync(resolved, next)
  }

  return { appended, created: !exists, filePath: resolved, skipped }
}
