import { readFileSync } from 'node:fs'

import { describe, expect, expectTypeOf, it } from 'vitest'

import { REGIONS } from '@/shared/regions.js'
import type { StorageRegion } from '@/shared/types/options.js'

describe('StorageRegion', () => {
  it('accepts every region code from the table and any other string', () => {
    expectTypeOf<keyof typeof REGIONS>().toExtend<StorageRegion>()
    expectTypeOf<'mi'>().toExtend<StorageRegion>()
  })
})

describe('REGIONS docs table', () => {
  it('matches the region table in the storage docs', () => {
    const docs = readFileSync(new URL('../../../docs/v4/configuration/storage/overview.mdx', import.meta.url), 'utf8')
    const flag = (cell: string) => cell === 'Yes'
    const rows = [...docs.matchAll(/^\| `(\w+)` +\| (.+?) +\| (\S+) +\| (\S+) +\| (\S+) +\| (\S+) +\|$/gm)].map(
      ([, code, label, hdd, ssd, s3, stream]) => [
        code,
        { hdd: flag(hdd), label, s3: flag(s3), ssd: flag(ssd), stream: flag(stream) },
      ],
    )
    expect(Object.fromEntries(rows)).toEqual(REGIONS)
    expect(rows.map(([code]) => code)).toEqual(Object.keys(REGIONS))
  })
})
