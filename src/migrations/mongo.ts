import type { Payload, PayloadRequest } from 'payload'

import type { BunnyCollectionTarget } from './index.js'
import { LEGACY_META_FIELD, LEGACY_VIDEO_ID_FIELD } from './index.js'

type NativeCollection = {
  updateMany: (
    filter: Record<string, unknown>,
    update: unknown,
    options?: Record<string, unknown>,
  ) => Promise<{ modifiedCount?: number }>
}

const collection = (payload: Payload, slug: string): NativeCollection => {
  const db = payload.db as unknown as { collections: Record<string, { collection: NativeCollection }> }
  return db.collections[slug].collection
}

const sessionFor = (payload: Payload, req?: PayloadRequest): unknown => {
  const id = req?.transactionID
  if (!id) {
    return undefined
  }
  const db = payload.db as unknown as { sessions?: Record<string, { session?: unknown }> }
  return db.sessions?.[String(id)]?.session
}

const metaPresent = (field: string) => ({ $ne: [{ $type: `$${field}` }, 'missing'] })

export const migrateMongo = async (
  payload: Payload,
  target: BunnyCollectionTarget,
  req?: PayloadRequest,
): Promise<number> => {
  const set: Record<string, unknown> = { 'bunnyData.stream.videoId': `$${LEGACY_VIDEO_ID_FIELD}` }

  if (target.hasResolutions) {
    set['bunnyData.stream.resolutions'] = {
      $cond: [
        metaPresent(LEGACY_META_FIELD),
        {
          available: `$${LEGACY_META_FIELD}.availableMp4Resolutions`,
          highest: `$${LEGACY_META_FIELD}.highestMp4Resolution`,
        },
        '$$REMOVE',
      ],
    }
  }

  const result = await collection(payload, target.slug).updateMany(
    { [LEGACY_VIDEO_ID_FIELD]: { $type: 'string' }, 'bunnyData.stream.videoId': { $exists: false } },
    [{ $set: set }],
    { session: sessionFor(payload, req) },
  )

  return result.modifiedCount ?? 0
}

export const rollbackMongo = async (
  payload: Payload,
  target: BunnyCollectionTarget,
  req?: PayloadRequest,
): Promise<number> => {
  const set: Record<string, unknown> = { [LEGACY_VIDEO_ID_FIELD]: '$bunnyData.stream.videoId' }

  if (target.hasResolutions) {
    set[LEGACY_META_FIELD] = {
      $cond: [
        { $ne: [{ $type: '$bunnyData.stream.resolutions' }, 'missing'] },
        {
          availableMp4Resolutions: '$bunnyData.stream.resolutions.available',
          highestMp4Resolution: '$bunnyData.stream.resolutions.highest',
        },
        '$$REMOVE',
      ],
    }
  }

  const result = await collection(payload, target.slug).updateMany(
    { [LEGACY_VIDEO_ID_FIELD]: { $exists: false }, 'bunnyData.stream.videoId': { $type: 'string' } },
    [{ $set: set }],
    { session: sessionFor(payload, req) },
  )

  return result.modifiedCount ?? 0
}

export const dropLegacyMongo = async (
  payload: Payload,
  target: BunnyCollectionTarget,
  req?: PayloadRequest,
): Promise<void> => {
  await collection(payload, target.slug).updateMany(
    {},
    { $unset: { [LEGACY_META_FIELD]: '', [LEGACY_VIDEO_ID_FIELD]: '' } },
    { session: sessionFor(payload, req) },
  )
}
