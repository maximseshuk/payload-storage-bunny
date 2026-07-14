import { createServer } from 'node:http'

import { log } from '../shared/log.js'

export const getServerUrl = (): string => {
  const url = process.env.E2E_SERVER_URL
  if (!url) {
    throw new Error('E2E_SERVER_URL is not set')
  }
  return url
}

export const findAvailablePort = async (startPort: number): Promise<number> => {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(startPort, () => {
      server.close(() => resolve(startPort))
    })
    server.on('error', () => {
      log.warn(`Port ${startPort} is in use, trying ${startPort + 1}...`)
      findAvailablePort(startPort + 1)
        .then(resolve)
        .catch(reject)
    })
  })
}

export const waitForServer = async (port: number, timeout = 60000): Promise<boolean> => {
  const start = Date.now()
  const url = `http://localhost:${port}/api/access`

  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return true
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}
