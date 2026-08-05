import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ProjectIdSource } from './types.js'

export const hashProjectId = (secret: string, rawSource: string): string =>
  createHash('sha256')
    .update(secret + rawSource)
    .digest('hex')

export const resolveRawSource = (candidates: {
  cwd: string
  git?: string
  packageJSON?: string
  serverURL?: string
}): { source: ProjectIdSource; value: string } => {
  if (candidates.git) {
    return { source: 'git', value: candidates.git }
  }

  if (candidates.packageJSON) {
    return { source: 'packageJSON', value: candidates.packageJSON }
  }

  if (candidates.serverURL) {
    return { source: 'serverURL', value: candidates.serverURL }
  }

  return { source: 'cwd', value: candidates.cwd }
}

const readGitRemote = (): string | undefined => {
  try {
    const url = execSync('git config --local --get remote.origin.url', {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    })
      .toString()
      .trim()

    return url || undefined
  } catch {
    return undefined
  }
}

const readAppPackageName = (cwd: string): string | undefined => {
  try {
    const parsed = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as { name?: unknown }

    return typeof parsed.name === 'string' && parsed.name ? parsed.name : undefined
  } catch {
    return undefined
  }
}

export const deriveProjectId = ({
  cwd = process.cwd(),
  git,
  packageJSON,
  secret,
  serverURL,
}: {
  cwd?: string
  git?: string
  packageJSON?: string
  secret: string
  serverURL?: string
}): { projectId: string; projectIdSource: ProjectIdSource } => {
  const raw = resolveRawSource({
    cwd,
    git: git ?? readGitRemote(),
    packageJSON: packageJSON ?? readAppPackageName(cwd),
    serverURL,
  })

  return { projectId: hashProjectId(secret, raw.value), projectIdSource: raw.source }
}
