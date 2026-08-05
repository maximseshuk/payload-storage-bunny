import { describe, expect, it } from 'vitest'

import { EDGE_SCRIPT_SOURCE } from '@/server/payload/storage/clientUploads/embedded.js'
import { ZONE_SECRET_PATTERN, ZONE_SECRET_PREFIX, zoneSecretName } from '@/shared/zoneSecret.js'

describe('zoneSecretName', () => {
  it('uppercases and maps hyphens to underscores', () => {
    expect(zoneSecretName('media')).toBe('ZONE_MEDIA')
    expect(zoneSecretName('my-zone-2')).toBe('ZONE_MY_ZONE_2')
  })

  it('always emits a valid env-var identifier that matches the pattern', () => {
    for (const zone of ['media', 'my-zone-2', 'a', 'z9', 'zone-with-many-parts']) {
      const name = zoneSecretName(zone)
      expect(name.startsWith(ZONE_SECRET_PREFIX)).toBe(true)
      expect(ZONE_SECRET_PATTERN.test(name)).toBe(true)
      expect(/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)).toBe(true)
    }
  })

  it('handles a max-length zone name', () => {
    const zone = 'a'.repeat(64)
    expect(zoneSecretName(zone)).toBe(`ZONE_${'A'.repeat(64)}`)
    expect(ZONE_SECRET_PATTERN.test(zoneSecretName(zone))).toBe(true)
  })

  it('is injective for the allowed zone-name alphabet ([a-z0-9-])', () => {
    const zones = ['media', 'archives', 'my-zone', 'my-zone-2', 'a-b', 'ab', 'a-b-c', 'x1', 'x-1']
    const encoded = zones.map(zoneSecretName)
    expect(new Set(encoded).size).toBe(zones.length)
  })
})

describe('worker/deploy encoder parity', () => {
  it('the deployed worker inlines the exact canonical derivation', () => {
    expect(EDGE_SCRIPT_SOURCE).toContain("'ZONE_' + zoneName.toUpperCase().replaceAll('-', '_')")
  })
})
