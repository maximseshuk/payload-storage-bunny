import type { Field, GroupField, Payload, PayloadRequest } from 'payload'

import { dropLegacyMongo, migrateMongo, rollbackMongo } from './mongo.js'
import { dropLegacySql, migrateSql, rollbackSql } from './sql.js'

export const LEGACY_VIDEO_ID_FIELD = 'bunnyVideoId'
export const LEGACY_META_FIELD = 'bunnyVideoMeta'
export const LEGACY_VIDEO_ID_COLUMN = 'bunny_video_id'
export const LEGACY_META_COLUMN = 'bunny_video_meta'
export const NEW_VIDEO_ID_COLUMN = 'bunny_data_stream_video_id'
export const NEW_RESOLUTIONS_COLUMN = 'bunny_data_stream_resolutions'

export type BunnyCollectionTarget = {
  hasResolutions: boolean
  slug: string
}

export type MigrateBunnyDataArgs = {
  collections?: string[]
  direction?: 'migrate' | 'rollback'
  drop?: boolean
  payload: Payload
  req?: PayloadRequest
}

export type MigrateBunnyDataResult = {
  adapter: string
  collections: { changed: number; slug: string }[]
  direction: 'migrate' | 'rollback'
}

const findGroup = (fields: Field[], name: string): GroupField | undefined => {
  return fields.find((field): field is GroupField => field.type === 'group' && 'name' in field && field.name === name)
}

const discoverTargets = (payload: Payload, only?: string[]): BunnyCollectionTarget[] => {
  const targets: BunnyCollectionTarget[] = []

  for (const collection of payload.config.collections) {
    if (only && !only.includes(collection.slug)) {
      continue
    }

    const bunnyData = findGroup(collection.fields, 'bunnyData')
    if (!bunnyData) {
      continue
    }

    const stream = findGroup(bunnyData.fields, 'stream')
    const hasResolutions = Boolean(stream?.fields.some((field) => 'name' in field && field.name === 'resolutions'))

    targets.push({ hasResolutions, slug: collection.slug })
  }

  return targets
}

export const migrateBunnyData = async (args: MigrateBunnyDataArgs): Promise<MigrateBunnyDataResult> => {
  const { collections: only, direction = 'migrate', drop = false, payload, req } = args
  const adapter = payload.db.name
  const isMongo = adapter === 'mongoose'
  const targets = discoverTargets(payload, only)

  const results: { changed: number; slug: string }[] = []

  for (const target of targets) {
    let changed: number

    if (direction === 'rollback') {
      changed = isMongo ? await rollbackMongo(payload, target, req) : await rollbackSql(payload, target, req)
    } else {
      changed = isMongo ? await migrateMongo(payload, target, req) : await migrateSql(payload, target, req)

      if (drop) {
        if (isMongo) {
          await dropLegacyMongo(payload, target, req)
        } else {
          await dropLegacySql(payload, target, req)
        }
      }
    }

    results.push({ changed, slug: target.slug })
    payload.logger.info(`[bunny:migrate] ${direction} "${target.slug}": ${changed} document(s)`)
  }

  return { adapter, collections: results, direction }
}
