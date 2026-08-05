import { describe, expect, it } from 'vitest'

import type { InitAnswers } from '@/cli/lib/plan.js'
import {
  buildInitPlan,
  deriveBaseName,
  deriveVideoLibraryName,
  sanitizeName,
  storageMainRegionOptions,
  storageReplicationRegionOptions,
  streamRegionOptions,
  validateCollectionSlug,
  validateStorageZoneName,
} from '@/cli/lib/plan.js'

const baseAnswers = (overrides: Partial<InitAnswers> = {}): InitAnswers => ({
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

describe('sanitizeName', () => {
  it('lowercases, strips the scope prefix and non-word characters', () => {
    expect(sanitizeName('@acme/My_App!!')).toBe('my-app')
  })

  it('collapses and trims hyphens', () => {
    expect(sanitizeName('--Foo   Bar--')).toBe('foo-bar')
  })

  it('truncates to the 20-char storage zone limit', () => {
    expect(sanitizeName('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijklmnopqrst')
    expect(sanitizeName('abcdefghijklmnopqrstuvwxyz').length).toBe(20)
  })
})

describe('deriveBaseName / deriveVideoLibraryName', () => {
  it('derives a base name from a scoped package name', () => {
    expect(deriveBaseName('@acme/media-app')).toBe('media-app')
  })

  it('falls back to "media" when the package name is missing or empty', () => {
    expect(deriveBaseName(undefined)).toBe('media')
    expect(deriveBaseName('@acme/!!!')).toBe('media')
  })

  it('appends -stream for the video library name', () => {
    expect(deriveVideoLibraryName('my-app')).toBe('my-app-stream')
  })
})

describe('validateStorageZoneName', () => {
  it('accepts a valid name', () => {
    expect(validateStorageZoneName('my-app')).toBeUndefined()
  })

  it('rejects empty, too-long and invalid-character names', () => {
    expect(validateStorageZoneName('')).toMatch(/required/)
    expect(validateStorageZoneName('a'.repeat(21))).toMatch(/20 characters/)
    expect(validateStorageZoneName('My App')).toMatch(/lowercase/)
  })
})

describe('validateCollectionSlug', () => {
  it('accepts a valid slug and rejects invalid ones', () => {
    expect(validateCollectionSlug('media')).toBeUndefined()
    expect(validateCollectionSlug('')).toMatch(/required/)
    expect(validateCollectionSlug('Media Files')).toMatch(/lowercase/)
  })
})

describe('storageMainRegionOptions', () => {
  it('offers the 9 HDD regions for HTTP (including São Paulo)', () => {
    const codes = storageMainRegionOptions('http').map((r) => r.code)
    expect(codes).toHaveLength(9)
    expect(codes).toContain('br')
    expect(codes[0]).toBe('de')
  })

  it('offers 8 S3 regions (HDD9 minus São Paulo)', () => {
    const codes = storageMainRegionOptions('s3').map((r) => r.code)
    expect(codes).toHaveLength(8)
    expect(codes).not.toContain('br')
    expect(codes[0]).toBe('de')
  })
})

describe('storageReplicationRegionOptions', () => {
  it('offers 9 for HTTP + Standard and 15 for HTTP + Edge/SSD', () => {
    expect(storageReplicationRegionOptions('http', 'standard')).toHaveLength(9)
    const edge = storageReplicationRegionOptions('http', 'edge').map((r) => r.code)
    expect(edge).toHaveLength(15)
    expect(edge).toEqual(expect.arrayContaining(['cz', 'es', 'mi', 'wa', 'hk', 'jp']))
  })

  it('offers 8 S3 regions (no São Paulo) regardless of tier', () => {
    expect(storageReplicationRegionOptions('s3', 'standard')).toHaveLength(8)
    const edge = storageReplicationRegionOptions('s3', 'edge').map((r) => r.code)
    expect(edge).toHaveLength(8)
    expect(edge).not.toContain('br')
  })
})

describe('streamRegionOptions', () => {
  it('offers 9 regions defaulting to Frankfurt first', () => {
    const options = streamRegionOptions()
    expect(options).toHaveLength(9)
    expect(options[0].code).toBe('de')
  })
})

describe('buildInitPlan', () => {
  it('plans both storage and stream for the "both" service', () => {
    const plan = buildInitPlan(baseAnswers())

    expect(plan.storage).toEqual({
      clientUploads: false,
      deployEdge: false,
      optimizer: false,
      pullZoneTier: 0,
      region: 'DE',
      replication: [],
      s3: false,
      secure: false,
      ssd: false,
      zoneName: 'my-app',
    })
    expect(plan.stream).toEqual({
      libraryName: 'my-app-stream',
      replication: [],
      secure: false,
    })
  })

  it('plans storage only', () => {
    const plan = buildInitPlan(baseAnswers({ service: 'storage' }))
    expect(plan.storage).toBeDefined()
    expect(plan.stream).toBeUndefined()
  })

  it('plans stream only', () => {
    const plan = buildInitPlan(baseAnswers({ service: 'stream' }))
    expect(plan.storage).toBeUndefined()
    expect(plan.stream).toBeDefined()
  })

  it('uppercases the region and enables S3 for the S3 access method', () => {
    const plan = buildInitPlan(baseAnswers({ region: 'ny', storageAccess: 's3' }))
    expect(plan.storage?.region).toBe('NY')
    expect(plan.storage?.s3).toBe(true)
  })

  it('keeps s3 off for the HTTP access method', () => {
    const plan = buildInitPlan(baseAnswers({ storageAccess: 'http' }))
    expect(plan.storage?.s3).toBe(false)
  })

  it('forces the main region to Frankfurt (DE) for the Edge/SSD tier, ignoring any selection', () => {
    const plan = buildInitPlan(baseAnswers({ region: 'ny', storageTier: 'edge' }))
    expect(plan.storage?.ssd).toBe(true)
    expect(plan.storage?.region).toBe('DE')
  })

  it('maps the optimizer answer into the storage plan step', () => {
    expect(buildInitPlan(baseAnswers({ optimizer: true })).storage?.optimizer).toBe(true)
    expect(buildInitPlan(baseAnswers({ optimizer: false })).storage?.optimizer).toBe(false)
  })

  it('marks resources secure when signed URLs are chosen', () => {
    const plan = buildInitPlan(baseAnswers({ signedUrls: true }))
    expect(plan.storage?.secure).toBe(true)
    expect(plan.stream?.secure).toBe(true)
  })

  it('maps uppercased replication regions for storage and stream', () => {
    const plan = buildInitPlan(baseAnswers({ storageReplication: ['uk', 'se'], streamReplication: ['la'] }))
    expect(plan.storage?.replication).toEqual(['UK', 'SE'])
    expect(plan.stream?.replication).toEqual(['LA'])
  })

  it('enables s3 presigned client uploads only for the S3 access method', () => {
    expect(buildInitPlan(baseAnswers({ clientUploads: true, storageAccess: 's3' })).storage?.clientUploads).toBe(true)
    expect(buildInitPlan(baseAnswers({ clientUploads: true, storageAccess: 'http' })).storage?.clientUploads).toBe(
      false,
    )
  })

  it('flags an edge deploy only for HTTP + client uploads + deploy-now', () => {
    expect(
      buildInitPlan(baseAnswers({ clientUploads: true, deployEdge: true, storageAccess: 'http' })).storage?.deployEdge,
    ).toBe(true)
    expect(
      buildInitPlan(baseAnswers({ clientUploads: true, deployEdge: true, storageAccess: 's3' })).storage?.deployEdge,
    ).toBe(false)
  })
})
