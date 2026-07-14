import path from 'node:path'

import type { Payload } from 'payload'
import { getPayload as getPayloadInstance } from 'payload'

export async function getPayload(suiteName: string): Promise<Payload> {
  const configPath = path.resolve(import.meta.dirname, `../../suites/${suiteName}/payload.config.ts`)

  const { default: config } = await import(configPath)

  return getPayloadInstance({ config })
}
