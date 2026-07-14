import { postgresAdapter } from '@payloadcms/db-postgres'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import type { Payload } from 'payload'
import { getPayload as getPayloadInstance } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrateBunnyData } from '@/migrations/index.js'

import { bunnyStorage } from '../../../src/index.js'
import { buildConfigWithDefaults } from '../../helpers/shared/buildConfigWithDefaults.js'
import { createMediaCollection } from '../../helpers/shared/createMediaCollection.js'
import { startPgliteServer, stopPgliteServer } from '../../helpers/shared/pgliteServer.js'

const SLUG = 'migration-media'
const TABLE = 'migration_media'
const META = { availableMp4Resolutions: ['720p', '480p'], highestMp4Resolution: '720p' }
const RESOLUTIONS = { available: ['720p', '480p'], highest: '720p' }
const NOW = new Date(0).toISOString()

const pluginConfig = () =>
  bunnyStorage({
    collections: { [SLUG]: { disablePayloadAccessControl: true, prefix: SLUG, signedUrls: false } },
    enabled: true,
    storage: { apiKey: 'x', hostname: 'storage.example.com', zoneName: 'zone' },
    stream: { apiKey: 'x', hostname: 'stream.example.com', libraryId: 12345, mp4Fallback: true },
  })

type Row = { resolutions: unknown; videoId: string }
type Legacy = { meta: unknown; videoId: string }

type Driver = {
  clearLegacy: (p: Payload) => Promise<void>
  label: string
  legacyGone: (p: Payload) => Promise<boolean>
  readLegacy: (p: Payload, videoId: string) => Promise<Legacy | undefined>
  readNew: (p: Payload, videoId: string) => Promise<Row | undefined>
  setup: () => Promise<Payload>
  teardown: (p: Payload) => Promise<void>
}

const buildPayload = async (key: string, db?: unknown): Promise<Payload> => {
  const config = await buildConfigWithDefaults({
    collections: [createMediaCollection({ slug: SLUG })],
    ...(db ? { db: db as never } : {}),
    plugins: [pluginConfig()],
  })
  return getPayloadInstance({ config, key })
}

const native = (p: Payload): any => (p.db as any).collections[SLUG].collection

const mongoDriver: Driver = {
  clearLegacy: async (p) => {
    await native(p).updateMany({}, { $unset: { bunnyVideoId: '', bunnyVideoMeta: '' } })
  },
  label: 'mongodb',
  legacyGone: async (p) => {
    const doc = await native(p).findOne({ 'bunnyData.stream.videoId': 'e7f2-guid-1' })
    return Boolean(doc) && !('bunnyVideoId' in doc)
  },
  readLegacy: async (p, videoId) => {
    const doc = await native(p).findOne({ 'bunnyData.stream.videoId': videoId })
    return doc ? { meta: doc.bunnyVideoMeta ?? null, videoId: doc.bunnyVideoId } : undefined
  },
  readNew: async (p, videoId) => {
    const doc = await native(p).findOne({ 'bunnyData.stream.videoId': videoId })
    return doc
      ? { resolutions: doc.bunnyData.stream.resolutions ?? null, videoId: doc.bunnyData.stream.videoId }
      : undefined
  },
  setup: async () => {
    const p = await buildPayload('migration-mongo')
    await native(p).deleteMany({})
    await native(p).insertMany([
      {
        alt: 'a',
        bunnyVideoId: 'e7f2-guid-1',
        bunnyVideoMeta: META,
        createdAt: NOW,
        filename: 'clip.mp4',
        mimeType: 'video/mp4',
        updatedAt: NOW,
      },
      {
        alt: 'b',
        bunnyVideoId: 'a1b2-guid-2',
        createdAt: NOW,
        filename: 'promo.mp4',
        mimeType: 'video/mp4',
        updatedAt: NOW,
      },
    ])
    return p
  },
  teardown: async (p) => {
    await native(p).deleteMany({})
    await p.destroy()
  },
}

const raw = async (p: Payload, sqlText: string): Promise<any[]> => {
  const result = await (p.db as any).execute({ drizzle: (p.db as any).drizzle, raw: sqlText })
  return result.rows ?? []
}

const parseJson = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return null
  }
  return typeof value === 'string' ? JSON.parse(value) : value
}

const columnNames = async (p: Payload): Promise<string[]> => {
  if (p.db.name === 'sqlite') {
    return (await raw(p, `SELECT name FROM pragma_table_info('${TABLE}')`)).map((c) => c.name)
  }
  return (await raw(p, `SELECT column_name AS name FROM information_schema.columns WHERE table_name = '${TABLE}'`)).map(
    (c) => c.name,
  )
}

type SqlOptions = {
  key: string
  label: string
  makeDb: () => unknown
  metaLiteral: string
  metaType: string
  start?: () => Promise<void>
  stop?: () => Promise<void>
}

const sqlDriver = (opts: SqlOptions): Driver => ({
  clearLegacy: async (p) => {
    await raw(p, `UPDATE ${TABLE} SET bunny_video_id = NULL, bunny_video_meta = NULL`)
  },
  label: opts.label,
  legacyGone: async (p) => !(await columnNames(p)).includes('bunny_video_id'),
  readLegacy: async (p, videoId) => {
    const d = (await raw(p, `SELECT * FROM ${TABLE} WHERE bunny_data_stream_video_id = '${videoId}'`))[0]
    return d ? { meta: parseJson(d.bunny_video_meta), videoId: d.bunny_video_id } : undefined
  },
  readNew: async (p, videoId) => {
    const d = (await raw(p, `SELECT * FROM ${TABLE} WHERE bunny_data_stream_video_id = '${videoId}'`))[0]
    return d
      ? { resolutions: parseJson(d.bunny_data_stream_resolutions), videoId: d.bunny_data_stream_video_id }
      : undefined
  },
  setup: async () => {
    if (opts.start) {
      await opts.start()
    }
    const p = await buildPayload(opts.key, opts.makeDb())
    await raw(p, `ALTER TABLE ${TABLE} ADD COLUMN bunny_video_id text`)
    await raw(p, `ALTER TABLE ${TABLE} ADD COLUMN bunny_video_meta ${opts.metaType}`)
    await raw(
      p,
      `INSERT INTO ${TABLE} (alt, filename, mime_type, updated_at, created_at, bunny_video_id, bunny_video_meta) VALUES ` +
        `('a', 'clip.mp4', 'video/mp4', '${NOW}', '${NOW}', 'e7f2-guid-1', ${opts.metaLiteral}),` +
        `('b', 'promo.mp4', 'video/mp4', '${NOW}', '${NOW}', 'a1b2-guid-2', NULL)`,
    )
    return p
  },
  teardown: async (p) => {
    ;(p.db as any).pool?.on?.('error', () => {})
    await p.destroy()
    if (opts.stop) {
      await opts.stop()
    }
  },
})

const META_JSON = JSON.stringify(META)

const drivers: Driver[] = [
  mongoDriver,
  sqlDriver({
    key: 'migration-sqlite',
    label: 'sqlite',
    makeDb: () => sqliteAdapter({ client: { url: ':memory:' } }),
    metaLiteral: `'${META_JSON}'`,
    metaType: 'text',
  }),
  sqlDriver({
    key: 'migration-postgres',
    label: 'postgres',
    makeDb: () =>
      postgresAdapter({ pool: { connectionString: process.env.POSTGRES_TEST_URI, max: 4, ssl: false }, push: true }),
    metaLiteral: `'${META_JSON}'::jsonb`,
    metaType: 'jsonb',
    start: async () => {
      process.env.POSTGRES_TEST_URI = await startPgliteServer()
    },
    stop: stopPgliteServer,
  }),
]

describe.each(drivers)('Data migration ($label)', (driver) => {
  let payload: Payload

  beforeAll(async () => {
    payload = await driver.setup()
  })

  afterAll(async () => {
    await driver.teardown(payload)
  })

  const changed = (result: Awaited<ReturnType<typeof migrateBunnyData>>) =>
    result.collections.find((c) => c.slug === SLUG)?.changed

  it('migrates legacy fields into bunnyData.stream', async () => {
    expect(changed(await migrateBunnyData({ payload }))).toBe(2)

    const withMeta = await driver.readNew(payload, 'e7f2-guid-1')
    expect(withMeta?.videoId).toBe('e7f2-guid-1')
    expect(withMeta?.resolutions).toEqual(RESOLUTIONS)

    const withoutMeta = await driver.readNew(payload, 'a1b2-guid-2')
    expect(withoutMeta?.videoId).toBe('a1b2-guid-2')
    expect(withoutMeta?.resolutions).toBeNull()
  })

  it('is idempotent on a second run', async () => {
    expect(changed(await migrateBunnyData({ payload }))).toBe(0)
  })

  it('restores legacy fields on rollback', async () => {
    await driver.clearLegacy(payload)
    expect(changed(await migrateBunnyData({ payload, direction: 'rollback' }))).toBe(2)

    const restored = await driver.readLegacy(payload, 'e7f2-guid-1')
    expect(restored?.videoId).toBe('e7f2-guid-1')
    expect(restored?.meta).toEqual(META)
  })

  it('drops legacy fields with drop:true', async () => {
    await migrateBunnyData({ payload, drop: true })
    expect(await driver.legacyGone(payload)).toBe(true)
  })
})
