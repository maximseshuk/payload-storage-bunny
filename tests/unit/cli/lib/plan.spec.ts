import { describe, expect, it } from 'vitest'

import {
  buildInitPlan,
  deriveBaseName,
  deriveVideoLibraryName,
  requiresStorageReplication,
  sanitizeName,
  storageMainRegionOptions,
  storageReplicationRegionOptions,
  streamRegionOptions,
  validateCollectionSlug,
  validateStorageZoneName,
} from '@/cli/lib/plan.js'

import { initAnswers } from '../../../helpers/unit/initAnswers.js'

describe('sanitizeName', () => {
  it('lowercases, strips the scope and non-word characters, collapses hyphens and truncates to 20 characters', () => {
    expect(sanitizeName('@acme/My_App!!')).toBe('my-app')
    expect(sanitizeName('--Foo   Bar--')).toBe('foo-bar')
    expect(sanitizeName('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijklmnopqrst')
  })
})

describe('deriveBaseName / deriveVideoLibraryName', () => {
  it('derives a base name from a scoped package name', () => {
    expect(deriveBaseName('@acme/media-app')).toBe('media-app')
  })

  it('falls back to "media" when the package name is missing, empty or too short', () => {
    expect(deriveBaseName(undefined)).toBe('media')
    expect(deriveBaseName('@acme/!!!')).toBe('media')
    expect(deriveBaseName('app')).toBe('media')
  })

  it('appends -stream for the video library name', () => {
    expect(deriveVideoLibraryName('my-app')).toBe('my-app-stream')
  })
})

describe('validateStorageZoneName', () => {
  it('accepts a valid name', () => {
    expect(validateStorageZoneName('my-app')).toBeUndefined()
  })

  it('rejects empty, too-short, too-long and invalid-character names', () => {
    expect(validateStorageZoneName('')).toMatch(/required/)
    expect(validateStorageZoneName('abc')).toMatch(/at least 4/)
    expect(validateStorageZoneName('a'.repeat(21))).toMatch(/20 characters/)
    expect(validateStorageZoneName('My App')).toMatch(/lowercase/)
  })
})

describe('requiresStorageReplication', () => {
  it('requires a replica only for a Standard zone in Los Angeles', () => {
    expect(requiresStorageReplication('standard', 'la')).toBe(true)
    expect(requiresStorageReplication('standard', 'de')).toBe(false)
    expect(requiresStorageReplication('edge', 'la')).toBe(false)
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
  it('offers the 9 HDD regions for HTTP and the same minus São Paulo for S3', () => {
    const http = storageMainRegionOptions('http').map((r) => r.code)
    const s3 = storageMainRegionOptions('s3').map((r) => r.code)
    expect(http).toHaveLength(9)
    expect(http[0]).toBe('de')
    expect(s3).toEqual(http.filter((code) => code !== 'br'))
  })
})

describe('storageReplicationRegionOptions', () => {
  it('offers 9 regions for HTTP Standard and 15 for HTTP Edge (SSD)', () => {
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
  it('offers 9 regions with Frankfurt first', () => {
    const options = streamRegionOptions()
    expect(options).toHaveLength(9)
    expect(options[0]).toEqual({ code: 'de', label: 'Frankfurt, DE (default)' })
  })
})

describe('region options', () => {
  it('builds every list from the shared region table', () => {
    const hdd = ['de', 'uk', 'se', 'ny', 'la', 'sg', 'syd', 'br', 'jh']
    const codes = (options: { code: string }[]) => options.map((r) => r.code)
    expect(codes(storageMainRegionOptions('http'))).toEqual(hdd)
    expect(codes(storageMainRegionOptions('s3'))).toEqual(hdd.filter((code) => code !== 'br'))
    expect(codes(storageReplicationRegionOptions('http', 'edge'))).toEqual([...hdd, 'cz', 'es', 'mi', 'wa', 'hk', 'jp'])
    expect(codes(streamRegionOptions())).toEqual(hdd)
  })
})

describe('buildInitPlan', () => {
  it('plans both storage and stream for the "both" service', () => {
    const plan = buildInitPlan(initAnswers())

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

  it('plans only the selected service', () => {
    expect(buildInitPlan(initAnswers({ service: 'storage' })).stream).toBeUndefined()
    expect(buildInitPlan(initAnswers({ service: 'stream' })).storage).toBeUndefined()
  })

  it('uppercases the region and enables S3 for the S3 access method', () => {
    const plan = buildInitPlan(initAnswers({ region: 'ny', storageAccess: 's3' }))
    expect(plan.storage?.region).toBe('NY')
    expect(plan.storage?.s3).toBe(true)
  })

  it('forces the main region to Frankfurt (DE) for the Edge (SSD) tier and ignores the selection', () => {
    const plan = buildInitPlan(initAnswers({ region: 'ny', storageTier: 'edge' }))
    expect(plan.storage?.ssd).toBe(true)
    expect(plan.storage?.region).toBe('DE')
  })

  it('maps the optimizer answer into the storage plan step', () => {
    expect(buildInitPlan(initAnswers({ optimizer: true })).storage?.optimizer).toBe(true)
    expect(buildInitPlan(initAnswers({ optimizer: false })).storage?.optimizer).toBe(false)
  })

  it('marks resources secure when signed URLs are chosen', () => {
    const plan = buildInitPlan(initAnswers({ signedUrls: true }))
    expect(plan.storage?.secure).toBe(true)
    expect(plan.stream?.secure).toBe(true)
  })

  it('maps uppercased replication regions for storage and stream', () => {
    const plan = buildInitPlan(initAnswers({ storageReplication: ['uk', 'se'], streamReplication: ['la'] }))
    expect(plan.storage?.replication).toEqual(['UK', 'SE'])
    expect(plan.stream?.replication).toEqual(['LA'])
  })

  it('enables S3 presigned client uploads only for the S3 access method', () => {
    expect(buildInitPlan(initAnswers({ clientUploads: true, storageAccess: 's3' })).storage?.clientUploads).toBe(true)
    expect(buildInitPlan(initAnswers({ clientUploads: true, storageAccess: 'http' })).storage?.clientUploads).toBe(
      false,
    )
  })

  it('plans an Edge Script deploy only for HTTP with client uploads and deploy now', () => {
    expect(
      buildInitPlan(initAnswers({ clientUploads: true, deployEdge: true, storageAccess: 'http' })).storage?.deployEdge,
    ).toBe(true)
    expect(
      buildInitPlan(initAnswers({ clientUploads: true, deployEdge: true, storageAccess: 's3' })).storage?.deployEdge,
    ).toBe(false)
  })
})
