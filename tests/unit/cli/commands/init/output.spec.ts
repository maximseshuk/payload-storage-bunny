import { describe, expect, it } from 'vitest'

import { buildOptionsObject, buildEnvEntries, buildInitOutput, buildInstallLines } from '@/cli/commands/init/output.js'
import type { InitAnswers } from '@/cli/lib/plan.js'
import type { ProvisionResult } from '@/cli/lib/provision.js'
import { createNormalizedOptions } from '@/server/payload/options/normalizer.js'
import { validateNormalizedOptions } from '@/server/payload/options/validator.js'

import { initAnswers } from '../../../../helpers/unit/initAnswers.js'

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
  it('returns the documented storage and stream names for a basic setup', () => {
    expect(names(buildEnvEntries(initAnswers(), result()))).toEqual([
      'BUNNY_STORAGE_API_KEY',
      'BUNNY_STORAGE_HOSTNAME',
      'BUNNY_STORAGE_ZONE_NAME',
      'BUNNY_STREAM_API_KEY',
      'BUNNY_STREAM_LIBRARY_ID',
      'BUNNY_STREAM_HOSTNAME',
    ])
  })

  it('adds token security and account keys when signed URLs and purge are chosen', () => {
    const entries = buildEnvEntries(initAnswers({ purge: true, signedUrls: true }), result(), 'the-account-key')
    expect(names(entries)).toContain('BUNNY_STORAGE_TOKEN_SECURITY_KEY')
    expect(names(entries)).toContain('BUNNY_STREAM_TOKEN_SECURITY_KEY')
    const account = entries.find((entry) => entry.name === 'BUNNY_ACCOUNT_API_KEY')
    expect(account?.value).toBe('the-account-key')
  })

  it('returns only stream names for a stream-only setup', () => {
    expect(names(buildEnvEntries(initAnswers({ service: 'stream' }), result()))).toEqual([
      'BUNNY_STREAM_API_KEY',
      'BUNNY_STREAM_LIBRARY_ID',
      'BUNNY_STREAM_HOSTNAME',
    ])
  })
})

describe('buildInitOutput options block', () => {
  it('renders an S3 block with signed URLs, client uploads and disablePayloadAccessControl', () => {
    const { optionsBlock } = buildInitOutput(
      initAnswers({ clientUploads: true, purge: true, signedUrls: true, storageAccess: 's3' }),
      result(),
    )
    expect(optionsBlock).toContain('collections: { media: { disablePayloadAccessControl: true } }')
    expect(optionsBlock).toContain('accountApiKey: process.env.BUNNY_ACCOUNT_API_KEY')
    expect(optionsBlock).toContain('purge: true')
    expect(optionsBlock).toContain('signedUrls: true')
    expect(optionsBlock).toContain('s3: true')
    expect(optionsBlock).toContain('clientUploads: true')
    expect(optionsBlock).toContain('libraryId: Number(process.env.BUNNY_STREAM_LIBRARY_ID)')
    expect(optionsBlock).not.toContain('mp4Fallback')
  })

  it('omits clientUploads for an S3 zone when client uploads are not chosen', () => {
    const { optionsBlock } = buildInitOutput(initAnswers({ storageAccess: 's3' }), result())
    expect(optionsBlock).toContain('s3: true')
    expect(optionsBlock).not.toContain('clientUploads')
  })

  it('renders an Edge clientUploads block and BUNNY_EDGE_SECRET for an HTTP zone with a deployed script', () => {
    const output = buildInitOutput(
      initAnswers({ clientUploads: true, deployEdge: true, storageAccess: 'http' }),
      result(),
    )
    expect(output.optionsBlock).toContain(
      "clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: process.env.BUNNY_EDGE_SECRET } }",
    )
    const secret = output.env.find((entry) => entry.name === 'BUNNY_EDGE_SECRET')
    expect(secret?.value).toBe('edge-secret')
  })

  it('omits the storage region for HTTP in Frankfurt and includes it otherwise', () => {
    expect(buildInitOutput(initAnswers({ region: 'de', storageAccess: 'http' }), result()).optionsBlock).not.toContain(
      'region:',
    )
    const ny = buildInitOutput(initAnswers({ region: 'ny', storageAccess: 'http' }), result()).optionsBlock
    expect(ny).toContain("region: 'ny'")
    expect(ny).not.toContain('s3:')
    const s3ny = buildInitOutput(initAnswers({ region: 'ny', storageAccess: 's3' }), result()).optionsBlock
    expect(s3ny).toContain("region: 'ny'")
    expect(s3ny).toContain('s3: true')
  })

  it('adds the thumbnail width hint only when the optimizer is enabled', () => {
    expect(buildInitOutput(initAnswers({ optimizer: true }), result()).optionsBlock).toContain(
      "thumbnail: { urlTransform: { queryParams: { width: '300' } } }",
    )
    expect(buildInitOutput(initAnswers(), result()).optionsBlock).not.toContain('thumbnail')
  })

  it('forces the effective region to DE for an Edge/SSD zone regardless of the answer', () => {
    const http = buildInitOutput(initAnswers({ region: 'uk', storageAccess: 'http', storageTier: 'edge' }), result())
    expect(http.optionsBlock).not.toContain('region:')
    const s3 = buildInitOutput(initAnswers({ region: 'uk', storageAccess: 's3', storageTier: 'edge' }), result())
    expect(s3.optionsBlock).toContain('s3: true')
    expect(s3.optionsBlock).not.toContain("region: 'uk'")
  })
})

describe('generated options validation', () => {
  const cases: Array<Partial<InitAnswers>> = [
    { service: 'storage' },
    { service: 'stream' },
    { clientUploads: true, service: 'storage', storageAccess: 's3' },
    { clientUploads: true, deployEdge: true, optimizer: true, purge: true, service: 'both', signedUrls: true },
  ]

  it.each(cases)('passes the plugin validator for answers %o', (overrides) => {
    const options = buildOptionsObject(initAnswers(overrides), result())
    expect(() => validateNormalizedOptions(createNormalizedOptions(options))).not.toThrow()
  })
})

describe('buildInstallLines', () => {
  it('pins the plugin and the peer to the project payload version', () => {
    expect(buildInstallLines('4.0.0-beta.1', '4.0.0-canary.37')).toEqual([
      'pnpm add @seshuk/payload-storage-bunny@4.0.0-beta.1 @payloadcms/plugin-cloud-storage@4.0.0-canary.37',
    ])
  })

  it('asks to pin the peer when payload is not in package.json', () => {
    const lines = buildInstallLines('4.0.0-beta.1', undefined)
    expect(lines[0]).toBe('pnpm add @seshuk/payload-storage-bunny@4.0.0-beta.1 @payloadcms/plugin-cloud-storage')
    expect(lines[1]).toContain('same version as your `payload` package')
  })
})
