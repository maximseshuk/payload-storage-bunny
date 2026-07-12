import type { ChildProcess } from 'node:child_process'

import { log } from './log.js'

export const killProcessGroup = async (proc: ChildProcess): Promise<void> => {
  const pid = proc.pid
  if (!pid || proc.killed) {
    return
  }

  log.info(`Stopping server (PID: ${pid})...`)

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        /* empty */
      }
      resolve()
    }, 10000)

    proc.once('exit', () => {
      clearTimeout(timeout)
      log.success('Server stopped')
      resolve()
    })

    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      proc.kill('SIGTERM')
    }
  })
}
