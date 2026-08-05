import { describe, expect, it } from 'vitest'

import { buildConfigObject, buildEnvEntries, buildInitOutput } from '@/cli/commands/init/output.js'
import type { InitAnswers } from '@/cli/lib/plan.js'
import type { ProvisionResult } from '@/cli/lib/provision.js'
import { createNormalizedConfig } from '@/server/payload/config/normalizer.js'
import { validateNormalizedConfig } from '@/server/payload/config/validator.js'

const answers = (overrides: Partial<InitAnswers> = {}): InitAnswers => ({
  clientUploads: false,
  collectionSlug: 'media',
  deployEdge: false,
  optimizer: false,
  purge: false,
  region: 'de',
  service: 'both',
  signedUrls: false,
  storageAccess: 'http',
  storageReplication: [],
  storageTier: 'standard',
  storageZoneName: 'my-app',
  streamReplication: [],
  videoLibraryName: 'my-app-stream',
  ...overrides,
})

const result = (overrides: Partial<ProvisionResult> = {}): ProvisionResult => ({
  ledger: { created: [], reused: [] },
  storage: {
    apiKey: 'zone-pass',
    edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'edge-secret' },
    hostname: 'my-app.b-cdn.net',
    region: 'de',
    tokenSecurityKey: 'storage-token',
    zoneName: 'my-app',
  },
  stream: {
    apiKey: 'lib-key',
    hostname: 'vz-x.b-cdn.net',
    libraryId: 300,
    tokenSecurityKey: 'stream-token',
  },
  ...overrides,
})

const names = (entries: { name: string }[]) => entries.map((entry) => entry.name)

describe('buildEnvEntries', () => {
  it('emits the documented storage + stream names for the basic case', () => {
    expect(names(buildEnvEntries(answers(), result()))).toEqual([
      'BUNNY_STORAGE_API_KEY',
      'BUNNY_STORAGE_HOSTNAME',
      'BUNNY_STORAGE_ZONE_NAME',
      'BUNNY_STREAM_API_KEY',
      'BUNNY_STREAM_LIBRARY_ID',
      'BUNNY_STREAM_HOSTNAME',
    ])
  })

  it('adds token security and account keys when signed URLs and purge are chosen', () => {
    const entries = buildEnvEntries(answers({ purge: true, signedUrls: true }), result(), 'the-account-key')
    expect(names(entries)).toContain('BUNNY_STORAGE_TOKEN_SECURITY_KEY')
    expect(names(entries)).toContain('BUNNY_STREAM_TOKEN_SECURITY_KEY')
    const account = entries.find((entry) => entry.name === 'BUNNY_ACCOUNT_API_KEY')
    expect(account?.value).toBe('the-account-key')
  })

  it('emits only stream names for a stream-only setup', () => {
    expect(names(buildEnvEntries(answers({ service: 'stream' }), result()))).toEqual([
      'BUNNY_STREAM_API_KEY',
      'BUNNY_STREAM_LIBRARY_ID',
      'BUNNY_STREAM_HOSTNAME',
    ])
  })
})

describe('buildInitOutput config block', () => {
  it('renders an S3 + signed + client-uploads block with disablePayloadAccessControl', () => {
    const { configBlock } = buildInitOutput(
      answers({ clientUploads: true, purge: true, signedUrls: true, storageAccess: 's3' }),
      result(),
    )
    expect(configBlock).toContain('collections: { media: { disablePayloadAccessControl: true } }')
    expect(configBlock).toContain('accountApiKey: process.env.BUNNY_ACCOUNT_API_KEY')
    expect(configBlock).toContain('purge: true')
    expect(configBlock).toContain('signedUrls: true')
    expect(configBlock).toContain("s3: { region: 'de' }")
    expect(configBlock).toContain('clientUploads: true')
    expect(configBlock).toContain('libraryId: Number(process.env.BUNNY_STREAM_LIBRARY_ID)')
    expect(configBlock).not.toContain('mp4Fallback')
  })

  it('omits clientUploads for an S3 zone when client uploads are not chosen', () => {
    const { configBlock } = buildInitOutput(answers({ storageAccess: 's3' }), result())
    expect(configBlock).toContain("s3: { region: 'de' }")
    expect(configBlock).not.toContain('clientUploads')
  })

  it('renders an edge clientUploads block + BUNNY_EDGE_SECRET for an HTTP zone with a deployed script', () => {
    const output = buildInitOutput(answers({ clientUploads: true, deployEdge: true, storageAccess: 'http' }), result())
    expect(output.configBlock).toContain(
      "clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: process.env.BUNNY_EDGE_SECRET } }",
    )
    const secret = output.env.find((entry) => entry.name === 'BUNNY_EDGE_SECRET')
    expect(secret?.value).toBe('edge-secret')
  })

  it('omits the storage region for HTTP + Frankfurt and includes it otherwise', () => {
    expect(buildInitOutput(answers({ region: 'de', storageAccess: 'http' }), result()).configBlock).not.toContain(
      'region:',
    )
    const ny = buildInitOutput(answers({ region: 'ny', storageAccess: 'http' }), result()).configBlock
    expect(ny).toContain("region: 'ny'")
    expect(ny).not.toContain('s3:')
  })

  it('adds the thumbnail width hint only when the optimizer is enabled', () => {
    expect(buildInitOutput(answers({ optimizer: true }), result()).configBlock).toContain(
      "thumbnail: { queryParams: { width: '300' } }",
    )
    expect(buildInitOutput(answers(), result()).configBlock).not.toContain('thumbnail')
  })

  it('forces the effective region to DE for an Edge/SSD zone regardless of the answer', () => {
    const http = buildInitOutput(answers({ region: 'uk', storageAccess: 'http', storageTier: 'edge' }), result())
    expect(http.configBlock).not.toContain('region:')
    const s3 = buildInitOutput(answers({ region: 'uk', storageAccess: 's3', storageTier: 'edge' }), result())
    expect(s3.configBlock).toContain("s3: { region: 'de' }")
    expect(s3.configBlock).not.toContain("region: 'uk'")
  })
})

describe('generated config passes the plugin validator', () => {
  const cases: Array<Partial<InitAnswers>> = [
    { service: 'storage' },
    { service: 'stream' },
    { clientUploads: true, service: 'storage', storageAccess: 's3' },
    { clientUploads: true, deployEdge: true, optimizer: true, purge: true, service: 'both', signedUrls: true },
  ]

  it.each(cases)('validates for answers %o', (overrides) => {
    const config = buildConfigObject(answers(overrides), result())
    expect(() => validateNormalizedConfig(createNormalizedConfig(config))).not.toThrow()
  })
})
