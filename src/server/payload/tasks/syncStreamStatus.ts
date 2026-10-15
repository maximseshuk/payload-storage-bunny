import type { JsonObject, Payload, PayloadRequest, Where } from 'payload'
import { createPayloadRequest } from 'payload'

import { isRateLimited } from '@/server/bunny/client.js'
import { getReadyResolutions, isMissingResolutions } from '@/server/bunny/stream.js'
import { readStoredVideo } from '@/server/payload/fields/bunnyGroupField.js'
import { getBunnyOptions } from '@/server/payload/options/access.js'
import {
  checkStreamOriginalSize,
  fetchStreamVideoState,
  writeStoredStream,
  writeStoredVersionStream,
} from '@/server/payload/stream/storedStream.js'
import { TIMEOUTS } from '@/shared/constants.js'
import type { BunnyStreamData, StreamVideoState } from '@/shared/types/index.js'

type SyncItem = {
  doc: { filesize?: unknown; id: number | string }
  id: number | string
  mirror?: Pick<BunnyStreamData, 'resolutions'> & { status: StreamVideoState }
}

export type StreamStatusSyncResult = {
  checked: number
  failed: number
  hasMore: boolean
  updated: number
}

const CONCURRENCY = 4
const DEFAULT_MAX_DURATION_MS = 25_000
const MIN_TIME_LEFT_MS = 2_000

export const syncStreamStatus = async ({
  limit,
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
  payload,
  req: incomingReq,
}: {
  limit?: number
  maxDurationMs?: number
  payload: Payload
  req?: PayloadRequest
}): Promise<StreamStatusSyncResult> => {
  const options = getBunnyOptions(payload)
  if (!options) {
    throw new Error('[bunny:tasks] status-sync: the storage-bunny plugin is not configured')
  }

  const collections = [...options.collections].flatMap(([collectionSlug, { stream }]) =>
    stream?.status && stream.status.sync ? [{ collectionSlug, stream, sync: stream.status.sync }] : [],
  )
  if (collections.length === 0) {
    throw new Error('[bunny:tasks] status-sync: no collection turns on `stream.status.sync`')
  }

  const req = incomingReq ?? (await createPayloadRequest({ payload }))
  const deadline = Date.now() + maxDurationMs
  const timeLeft = () => Math.max(1, Math.min(TIMEOUTS.DEFAULT, deadline - Date.now()))
  const nearDeadline = () => deadline - Date.now() < MIN_TIME_LEFT_MS
  const result: StreamStatusSyncResult = { checked: 0, failed: 0, hasMore: false, updated: 0 }
  let stopped = false
  let writes: Promise<unknown> = Promise.resolve()

  for (const { collectionSlug, stream, sync } of collections) {
    const config = payload.collections[collectionSlug]?.config
    if (!config || config.timestamps === false) {
      payload.logger.warn({
        msg: `[bunny:tasks] status-sync: skipped the collection "${collectionSlug}", because Payload does not have it or it has no timestamps`,
      })
      continue
    }

    const { apiKey, libraryId, mp4Fallback } = stream
    const pageSize = limit ?? sync.limit
    const updatedAfter = new Date(Date.now() - sync.maxAge * 1000).toISOString()
    const pending = (path: string): Where => ({
      or: [
        { and: [{ [`${path}.status`]: { equals: 'processing' } }, { updatedAt: { greater_than: updatedAfter } }] },
        { and: [{ [`${path}.status`]: { exists: false } }, { [`${path}.videoId`]: { exists: true } }] },
      ],
    })

    const scan = async (
      findPage: (
        after: Where[],
      ) => Promise<{ items: SyncItem[]; rows: { id: number | string; updatedAt?: unknown }[] }>,
      writeStream: typeof writeStoredStream,
    ) => {
      let cursor: { id: number | string; updatedAt: string } | undefined

      while (!stopped) {
        if (nearDeadline()) {
          stopped = true
          break
        }

        const { items, rows } = await findPage(
          cursor
            ? [
                {
                  or: [
                    { updatedAt: { less_than: cursor.updatedAt } },
                    { and: [{ updatedAt: { equals: cursor.updatedAt } }, { id: { less_than: cursor.id } }] },
                  ],
                },
              ]
            : [],
        )

        const queue = [...items]
        const worker = async () => {
          while (!stopped) {
            const item = queue[0]
            if (!item) {
              return
            }
            if (nearDeadline()) {
              stopped = true
              return
            }
            queue.shift()

            const { doc, id, mirror } = item
            const stored = readStoredVideo(doc)
            const videoId = stored?.videoId
            if (!videoId) {
              continue
            }

            try {
              const whenStatus = stored.status ?? null
              let status = mirror?.status
              let resolutions = mirror ? mirror.resolutions : stored.resolutions
              if (!status) {
                const { encoded, state } = await fetchStreamVideoState({
                  apiKey,
                  libraryId,
                  timeout: timeLeft(),
                  videoId,
                })
                result.checked++
                status = state
                if (state !== 'processing') {
                  resolutions = await getReadyResolutions({
                    apiKey,
                    encoded,
                    libraryId,
                    logger: payload.logger,
                    mp4Fallback,
                    resolutions: stored.resolutions,
                    timeout: timeLeft(),
                    videoId,
                  })
                  if (isMissingResolutions({ encoded, mp4Fallback, resolutions })) {
                    status = 'processing'
                  }
                }
              }
              if (status === whenStatus) {
                continue
              }
              const write = writes.then(() =>
                writeStream({
                  collection: collectionSlug,
                  id,
                  req,
                  stream: { resolutions, status, videoId },
                  whenStatus,
                }),
              )
              writes = write.catch(() => undefined)
              if (await write) {
                result.updated++
                if (status === 'ready' && !mirror) {
                  await checkStreamOriginalSize({
                    apiKey,
                    collection: collectionSlug,
                    doc,
                    libraryId,
                    logger: payload.logger,
                    videoId,
                  })
                }
              }
            } catch (err) {
              if (nearDeadline()) {
                stopped = true
                return
              }
              if (isRateLimited(err)) {
                stopped = true
                payload.logger.warn({ msg: '[bunny:tasks] status-sync: Bunny rate limit reached, stopping this run' })
                return
              }
              result.failed++
              payload.logger.error({ err, msg: '[bunny:tasks] status-sync: failed to check video', videoId })
            }
          }
        }

        await Promise.all(Array.from({ length: CONCURRENCY }, worker))

        if (rows.length < pageSize) {
          break
        }
        const last = rows.at(-1)!
        cursor = { id: last.id, updatedAt: last.updatedAt as string }
      }
    }

    await scan(async (after) => {
      const { docs } = await payload.find({
        collection: collectionSlug,
        depth: 0,
        limit: pageSize,
        overrideAccess: true,
        pagination: false,
        req,
        select: { bunnyData: true, filesize: true, updatedAt: true },
        sort: ['-updatedAt', '-id'],
        where: { and: [pending('bunnyData.stream'), ...after] },
      })
      return { items: docs.map((doc) => ({ id: doc.id, doc })), rows: docs }
    }, writeStoredStream)

    if (!config.versions?.drafts) {
      continue
    }

    await scan(async (after) => {
      const { docs: rows } = await payload.db.findVersions<JsonObject>({
        collection: collectionSlug,
        limit: pageSize,
        pagination: false,
        req,
        select: { parent: true, updatedAt: true, version: { bunnyData: true, filesize: true } },
        sort: ['-updatedAt', '-id'],
        where: { and: [pending('version.bunnyData.stream'), { latest: { equals: true } }, ...after] },
      })
      if (rows.length === 0) {
        return { items: [], rows }
      }
      const parents = rows.map(({ parent }) => parent)
      const { docs: mains } = await payload.db.find<JsonObject>({
        collection: collectionSlug,
        limit: parents.length,
        pagination: false,
        req,
        select: { bunnyData: true },
        where: {
          and: [{ id: { in: parents } }, ...(config.trash ? [{ deletedAt: { exists: false } }] : [])],
        },
      })
      const mainStreams = new Map(mains.map((main) => [String(main.id), readStoredVideo(main)]))
      const items = rows.flatMap(({ id, parent, version }): SyncItem[] => {
        if (!mainStreams.has(String(parent))) {
          return []
        }
        const main = mainStreams.get(String(parent))
        const stored = readStoredVideo(version)
        const doc = { ...version, id: parent as number | string }
        if (main?.videoId !== stored?.videoId) {
          return [{ id, doc }]
        }
        return main?.status && main.status !== stored?.status
          ? [{ id, doc, mirror: { resolutions: main.resolutions, status: main.status } }]
          : []
      })
      return { items, rows }
    }, writeStoredVersionStream)
  }

  if (stopped) {
    result.hasMore = true
  }

  return result
}
