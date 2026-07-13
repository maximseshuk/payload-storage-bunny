import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrateBunnyData } from '@/migrations/index.js'

import { getPayload } from '../../helpers/getPayload.js'

const table = 'migration_media_sql'
const slug = 'migration-media-sql'

describe('Bunny data migration (sqlite)', () => {
  let payload: Payload

  const db = (): any => payload.db as any
  const raw = async (sqlText: string): Promise<Record<string, any>[]> => {
    const result = await db().execute({ drizzle: db().drizzle, raw: sqlText })
    return result.rows ?? []
  }
  const rowByVideoId = async (videoId: string) =>
    (await raw(`SELECT * FROM ${table} WHERE bunny_data_stream_video_id = '${videoId}'`))[0]

  beforeAll(async () => {
    payload = await getPayload('migration-sql')

    // Simulate a v2 database: legacy columns exist on the table.
    await raw(`ALTER TABLE ${table} ADD COLUMN bunny_video_id TEXT`)
    await raw(`ALTER TABLE ${table} ADD COLUMN bunny_video_meta TEXT`)

    const now = new Date(0).toISOString()
    await raw(
      `INSERT INTO ${table} (alt, filename, mime_type, updated_at, created_at, bunny_video_id, bunny_video_meta) VALUES ` +
        `('video with meta', 'a.mp4', 'video/mp4', '${now}', '${now}', 'vid-1', '{"availableMp4Resolutions":["720p","480p"],"highestMp4Resolution":"720p"}'),` +
        `('video without meta', 'b.mp4', 'video/mp4', '${now}', '${now}', 'vid-2', NULL),` +
        `('plain image', 'c.jpg', 'image/jpeg', '${now}', '${now}', NULL, NULL)`,
    )
  })

  afterAll(async () => {
    await payload.destroy()
  })

  it('migrates legacy columns into bunnyData.stream', async () => {
    const result = await migrateBunnyData({ payload })

    expect(result.adapter).toBe('sqlite')
    expect(result.collections.find((c) => c.slug === slug)?.changed).toBe(2)

    const withMeta = await rowByVideoId('vid-1')
    expect(withMeta.bunny_video_id).toBe('vid-1')
    expect(JSON.parse(withMeta.bunny_data_stream_resolutions)).toEqual({
      available: ['720p', '480p'],
      highest: '720p',
    })

    const withoutMeta = await rowByVideoId('vid-2')
    expect(withoutMeta.bunny_data_stream_resolutions).toBeNull()

    const image = (await raw(`SELECT * FROM ${table} WHERE filename = 'c.jpg'`))[0]
    expect(image.bunny_data_stream_video_id).toBeNull()
  })

  it('is idempotent on a second run', async () => {
    const result = await migrateBunnyData({ payload })
    expect(result.collections.find((c) => c.slug === slug)?.changed).toBe(0)
  })

  it('restores legacy columns on rollback', async () => {
    await raw(`UPDATE ${table} SET bunny_video_id = NULL, bunny_video_meta = NULL`)

    const result = await migrateBunnyData({ payload, direction: 'rollback' })
    expect(result.collections.find((c) => c.slug === slug)?.changed).toBe(2)

    const restored = await rowByVideoId('vid-1')
    expect(restored.bunny_video_id).toBe('vid-1')
    expect(JSON.parse(restored.bunny_video_meta)).toEqual({
      availableMp4Resolutions: ['720p', '480p'],
      highestMp4Resolution: '720p',
    })
  })

  it('drops legacy columns with drop:true', async () => {
    await migrateBunnyData({ payload, drop: true })

    const cols = await raw(`SELECT name FROM pragma_table_info('${table}')`)
    const names = cols.map((c) => c.name)
    expect(names).not.toContain('bunny_video_id')
    expect(names).not.toContain('bunny_video_meta')
    expect(names).toContain('bunny_data_stream_video_id')
  })
})
