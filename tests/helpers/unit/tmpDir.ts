import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach } from 'vitest'

export const useTmpDir = (prefix: string): (() => string) => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true })
  })
  return () => {
    const dir = mkdtempSync(path.join(tmpdir(), prefix))
    dirs.push(dir)
    return dir
  }
}
