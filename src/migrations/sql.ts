import type { Payload, PayloadRequest } from 'payload'

import type { BunnyCollectionTarget } from './index.js'
import { LEGACY_META_COLUMN, LEGACY_VIDEO_ID_COLUMN, NEW_RESOLUTIONS_COLUMN, NEW_VIDEO_ID_COLUMN } from './index.js'

type SqlFragment = unknown
type SqlTag = {
  (strings: TemplateStringsArray, ...values: unknown[]): SqlFragment
  identifier: (name: string) => SqlFragment
  raw: (value: string) => SqlFragment
}

const toSnakeCase = (value: string): string => {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

const tableName = (target: BunnyCollectionTarget): string => toSnakeCase(target.slug)

const getSql = async (): Promise<SqlTag> => (await import('drizzle-orm')).sql as unknown as SqlTag

const drizzleFor = (payload: Payload, req?: PayloadRequest): unknown => {
  const db = payload.db as unknown as { drizzle: unknown; sessions?: Record<string, { db?: unknown }> }
  const id = req?.transactionID
  return (id && db.sessions?.[String(id)]?.db) || db.drizzle
}

const exec = async (payload: Payload, req: PayloadRequest | undefined, statement: SqlFragment): Promise<any> => {
  const db = payload.db as unknown as { execute: (args: { drizzle: unknown; sql: unknown }) => unknown }
  return db.execute({ drizzle: drizzleFor(payload, req), sql: statement })
}

const affected = (result: any): number => Number(result?.rowsAffected ?? result?.rowCount ?? result?.changes ?? 0)

const legacyColumnsExist = async (payload: Payload, table: string): Promise<boolean> => {
  const sql = await getSql()

  if (payload.db.name === 'sqlite') {
    const result = await exec(
      payload,
      undefined,
      sql.raw(`SELECT COUNT(*) AS c FROM pragma_table_info('${table}') WHERE name = '${LEGACY_VIDEO_ID_COLUMN}'`),
    )
    return Number((result.rows ?? [])[0]?.c) > 0
  }

  const result = await exec(
    payload,
    undefined,
    sql`SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${LEGACY_VIDEO_ID_COLUMN}`,
  )
  return Number((result.rows ?? [])[0]?.c) > 0
}

// meta { availableMp4Resolutions, highestMp4Resolution } → resolutions { available, highest }
const forwardResolutions = (sql: SqlTag, dialect: string, meta: SqlFragment): SqlFragment => {
  if (dialect === 'postgres') {
    return sql`CASE WHEN ${meta} IS NOT NULL THEN jsonb_build_object('available', ${meta}->'availableMp4Resolutions', 'highest', ${meta}->>'highestMp4Resolution') ELSE NULL END`
  }
  return sql`CASE WHEN ${meta} IS NOT NULL THEN json_object('available', json(json_extract(${meta}, '$.availableMp4Resolutions')), 'highest', json_extract(${meta}, '$.highestMp4Resolution')) ELSE NULL END`
}

// resolutions { available, highest } → meta { availableMp4Resolutions, highestMp4Resolution }
const reverseMeta = (sql: SqlTag, dialect: string, resolutions: SqlFragment): SqlFragment => {
  if (dialect === 'postgres') {
    return sql`CASE WHEN ${resolutions} IS NOT NULL THEN jsonb_build_object('availableMp4Resolutions', ${resolutions}->'available', 'highestMp4Resolution', ${resolutions}->>'highest') ELSE NULL END`
  }
  return sql`CASE WHEN ${resolutions} IS NOT NULL THEN json_object('availableMp4Resolutions', json(json_extract(${resolutions}, '$.available')), 'highestMp4Resolution', json_extract(${resolutions}, '$.highest')) ELSE NULL END`
}

export const migrateSql = async (
  payload: Payload,
  target: BunnyCollectionTarget,
  req?: PayloadRequest,
): Promise<number> => {
  const table = tableName(target)
  if (!(await legacyColumnsExist(payload, table))) {
    return 0
  }

  const sql = await getSql()
  const t = sql.identifier(table)
  const setResolutions = target.hasResolutions
    ? sql`, ${sql.identifier(NEW_RESOLUTIONS_COLUMN)} = ${forwardResolutions(sql, payload.db.name, sql.identifier(LEGACY_META_COLUMN))}`
    : sql``

  const result = await exec(
    payload,
    req,
    sql`UPDATE ${t} SET ${sql.identifier(NEW_VIDEO_ID_COLUMN)} = ${sql.identifier(LEGACY_VIDEO_ID_COLUMN)}${setResolutions} WHERE ${sql.identifier(LEGACY_VIDEO_ID_COLUMN)} IS NOT NULL AND ${sql.identifier(NEW_VIDEO_ID_COLUMN)} IS NULL`,
  )

  return affected(result)
}

export const rollbackSql = async (
  payload: Payload,
  target: BunnyCollectionTarget,
  req?: PayloadRequest,
): Promise<number> => {
  const table = tableName(target)
  if (!(await legacyColumnsExist(payload, table))) {
    return 0
  }

  const sql = await getSql()
  const t = sql.identifier(table)
  const setMeta = target.hasResolutions
    ? sql`, ${sql.identifier(LEGACY_META_COLUMN)} = ${reverseMeta(sql, payload.db.name, sql.identifier(NEW_RESOLUTIONS_COLUMN))}`
    : sql``

  const result = await exec(
    payload,
    req,
    sql`UPDATE ${t} SET ${sql.identifier(LEGACY_VIDEO_ID_COLUMN)} = ${sql.identifier(NEW_VIDEO_ID_COLUMN)}${setMeta} WHERE ${sql.identifier(NEW_VIDEO_ID_COLUMN)} IS NOT NULL AND ${sql.identifier(LEGACY_VIDEO_ID_COLUMN)} IS NULL`,
  )

  return affected(result)
}

export const dropLegacySql = async (
  payload: Payload,
  target: BunnyCollectionTarget,
  req?: PayloadRequest,
): Promise<void> => {
  const table = tableName(target)
  if (!(await legacyColumnsExist(payload, table))) {
    return
  }

  const sql = await getSql()
  const t = sql.identifier(table)
  await exec(payload, req, sql`ALTER TABLE ${t} DROP COLUMN ${sql.identifier(LEGACY_VIDEO_ID_COLUMN)}`)
  await exec(payload, req, sql`ALTER TABLE ${t} DROP COLUMN ${sql.identifier(LEGACY_META_COLUMN)}`)
}
