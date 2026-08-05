import type { EnvEntry } from '@/cli/lib/envFile.js'
import type { BunnyStorageConfig } from '@/shared/types/config.js'

import type { InitAnswers } from '../../lib/plan.js'
import { DEFAULT_REGION, wantsStorage, wantsStream } from '../../lib/plan.js'
import type { ProvisionResult } from '../../lib/provision.js'

export type InitOutput = {
  configBlock: string
  env: EnvEntry[]
  warnings: string[]
}

const EDGE_SECRET_PLACEHOLDER = 'set-me-to-your-existing-edge-secret'

const UNKNOWN_EDGE_SECRET_WARNING =
  "Could not determine the existing Edge Script's shared secret — set BUNNY_EDGE_SECRET to the value used by your other project(s), or rotate it everywhere with `npx payload bunny:deploy-edge-script --secret <new>`."

const effectiveRegion = (answers: InitAnswers): string =>
  answers.storageTier === 'edge' ? DEFAULT_REGION : answers.region

const usesS3ClientUploads = (answers: InitAnswers): boolean => answers.clientUploads && answers.storageAccess === 's3'

const edgeClientUploads = (
  answers: InitAnswers,
  result: ProvisionResult,
): { scriptUrl: string; secret: string; secretKnown?: boolean } | undefined =>
  answers.clientUploads && answers.storageAccess === 'http' && answers.deployEdge ? result.storage?.edge : undefined

export const buildEnvEntries = (answers: InitAnswers, result: ProvisionResult, accountApiKey = ''): EnvEntry[] => {
  const entries: EnvEntry[] = []

  if (answers.purge) {
    entries.push({ name: 'BUNNY_ACCOUNT_API_KEY', value: accountApiKey })
  }

  if (wantsStorage(answers.service) && result.storage) {
    entries.push({ name: 'BUNNY_STORAGE_API_KEY', value: result.storage.apiKey })
    entries.push({ name: 'BUNNY_STORAGE_HOSTNAME', value: result.storage.hostname })
    entries.push({ name: 'BUNNY_STORAGE_ZONE_NAME', value: result.storage.zoneName })
    if (answers.signedUrls && result.storage.tokenSecurityKey) {
      entries.push({ name: 'BUNNY_STORAGE_TOKEN_SECURITY_KEY', value: result.storage.tokenSecurityKey })
    }
    const edge = edgeClientUploads(answers, result)
    if (edge) {
      entries.push({
        name: 'BUNNY_EDGE_SECRET',
        value: edge.secretKnown === false ? EDGE_SECRET_PLACEHOLDER : edge.secret,
      })
    }
  }

  if (wantsStream(answers.service) && result.stream) {
    entries.push({ name: 'BUNNY_STREAM_API_KEY', value: result.stream.apiKey })
    entries.push({ name: 'BUNNY_STREAM_LIBRARY_ID', value: String(result.stream.libraryId) })
    entries.push({ name: 'BUNNY_STREAM_HOSTNAME', value: result.stream.hostname })
    if (answers.signedUrls && result.stream.tokenSecurityKey) {
      entries.push({ name: 'BUNNY_STREAM_TOKEN_SECURITY_KEY', value: result.stream.tokenSecurityKey })
    }
  }

  return entries
}

export const buildConfigBlock = (answers: InitAnswers, result: ProvisionResult): string => {
  const lines: string[] = ['bunnyStorage({']
  lines.push(`  collections: { ${answers.collectionSlug}: { disablePayloadAccessControl: true } },`)

  if (answers.purge) {
    lines.push('  accountApiKey: process.env.BUNNY_ACCOUNT_API_KEY,')
    lines.push('  purge: true,')
  }

  if (answers.signedUrls) {
    lines.push('  signedUrls: true,')
  }

  if (answers.optimizer) {
    lines.push("  thumbnail: { queryParams: { width: '300' } },")
  }

  if (wantsStorage(answers.service)) {
    const edge = edgeClientUploads(answers, result)
    const region = effectiveRegion(answers)
    lines.push('  storage: {')
    lines.push('    apiKey: process.env.BUNNY_STORAGE_API_KEY,')
    lines.push('    hostname: process.env.BUNNY_STORAGE_HOSTNAME,')
    lines.push('    zoneName: process.env.BUNNY_STORAGE_ZONE_NAME,')
    if (answers.storageAccess === 'http' && region !== DEFAULT_REGION) {
      lines.push(`    region: '${region}',`)
    }
    if (answers.signedUrls) {
      lines.push('    tokenSecurityKey: process.env.BUNNY_STORAGE_TOKEN_SECURITY_KEY,')
    }
    if (answers.storageAccess === 's3') {
      lines.push(`    s3: { region: '${region}' },`)
      if (usesS3ClientUploads(answers)) {
        lines.push('    clientUploads: true,')
      }
    } else if (edge) {
      lines.push(
        `    clientUploads: { edge: { scriptUrl: '${edge.scriptUrl}', secret: process.env.BUNNY_EDGE_SECRET } },`,
      )
    }
    lines.push('  },')
  }

  if (wantsStream(answers.service)) {
    lines.push('  stream: {')
    lines.push('    apiKey: process.env.BUNNY_STREAM_API_KEY,')
    lines.push('    hostname: process.env.BUNNY_STREAM_HOSTNAME,')
    lines.push('    libraryId: Number(process.env.BUNNY_STREAM_LIBRARY_ID),')
    if (answers.signedUrls) {
      lines.push('    tokenSecurityKey: process.env.BUNNY_STREAM_TOKEN_SECURITY_KEY,')
    }
    lines.push('  },')
  }

  lines.push('})')
  return lines.join('\n')
}

export const buildInitOutput = (answers: InitAnswers, result: ProvisionResult, accountApiKey = ''): InitOutput => {
  const edge = edgeClientUploads(answers, result)
  return {
    configBlock: buildConfigBlock(answers, result),
    env: buildEnvEntries(answers, result, accountApiKey),
    warnings: edge?.secretKnown === false ? [UNKNOWN_EDGE_SECRET_WARNING] : [],
  }
}

export const buildConfigObject = (answers: InitAnswers, result: ProvisionResult): BunnyStorageConfig => {
  const config: BunnyStorageConfig = {
    collections: { [answers.collectionSlug]: { disablePayloadAccessControl: true } },
  }

  if (answers.purge) {
    config.accountApiKey = 'account-key'
    config.purge = true
  }

  if (answers.signedUrls) {
    config.signedUrls = true
  }

  if (answers.optimizer) {
    config.thumbnail = { queryParams: { width: '300' } }
  }

  if (wantsStorage(answers.service) && result.storage) {
    const region = effectiveRegion(answers)
    if (answers.storageAccess === 's3') {
      config.storage = {
        apiKey: result.storage.apiKey,
        clientUploads: usesS3ClientUploads(answers) ? true : undefined,
        hostname: result.storage.hostname,
        s3: { region },
        tokenSecurityKey: answers.signedUrls ? result.storage.tokenSecurityKey : undefined,
        zoneName: result.storage.zoneName,
      }
    } else {
      const edge = edgeClientUploads(answers, result)
      config.storage = {
        apiKey: result.storage.apiKey,
        clientUploads: edge ? { edge: { scriptUrl: edge.scriptUrl, secret: edge.secret } } : undefined,
        hostname: result.storage.hostname,
        region: region === DEFAULT_REGION ? undefined : region,
        tokenSecurityKey: answers.signedUrls ? result.storage.tokenSecurityKey : undefined,
        zoneName: result.storage.zoneName,
      }
    }
  }

  if (wantsStream(answers.service) && result.stream) {
    config.stream = {
      apiKey: result.stream.apiKey,
      hostname: result.stream.hostname,
      libraryId: result.stream.libraryId,
      tokenSecurityKey: answers.signedUrls ? result.stream.tokenSecurityKey : undefined,
    }
  }

  return config
}
