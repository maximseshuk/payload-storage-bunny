import type { Payload, PayloadRequest } from 'payload'
import { createLocalReq } from 'payload'

import { isRateLimited } from '@/server/bunny/client.js'
import { getReadyResolutions, isMissingResolutions } from '@/server/bunny/stream.js'
import { readStoredVideo } from '@/server/payload/fields/bunnyGroupField.js'
import { getBunnyOptions } from '@/server/payload/options/access.js'
import { fetchStreamVideoState, writeStoredStream } from '@/server/payload/stream/storedStream.js'
import { TIMEOUTS } from '@/shared/constants.js'

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

  const req = incomingReq ?? (await createLocalReq({}, payload))
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
    let cursor: { ids: (number | string)[]; updatedAt: string } | undefined

    while (!stopped) {
      if (nearDeadline()) {
        stopped = true
        break
      }

      const { docs } = await payload.find({
        collection: collectionSlug,
        depth: 0,
        limit: pageSize,
        overrideAccess: true,
        pagination: false,
        req,
        select: { bunnyData: true, updatedAt: true },
        sort: '-updatedAt',
        where: {
          and: [
            { 'bunnyData.stream.status': { equals: 'processing' } },
            { updatedAt: { greater_than: updatedAfter } },
            ...(cursor ? [{ updatedAt: { less_than_equal: cursor.updatedAt } }, { id: { not_in: cursor.ids } }] : []),
          ],
        },
      })

      const queue = [...docs]
      const worker = async () => {
        while (!stopped) {
          const doc = queue[0]
          if (!doc) {
            return
          }
          if (nearDeadline()) {
            stopped = true
            return
          }
          queue.shift()

          const stored = readStoredVideo(doc)
          const videoId = stored?.videoId
          if (!videoId) {
            continue
          }

          try {
            const { encoded, state } = await fetchStreamVideoState({ apiKey, libraryId, timeout: timeLeft(), videoId })
            result.checked++
            if (state === 'processing') {
              continue
            }
            const resolutions = await getReadyResolutions({
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
              continue
            }
            const write = writes.then(() =>
              writeStoredStream({
                collection: collectionSlug,
                id: doc.id,
                req,
                stream: { resolutions, status: state, videoId },
                whenStatus: 'processing',
              }),
            )
            writes = write.catch(() => undefined)
            if (await write) {
              result.updated++
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

      if (docs.length < pageSize) {
        break
      }
      const last = docs.at(-1)!.updatedAt as string
      const idsAtLast = docs.filter((doc) => doc.updatedAt === last).map((doc) => doc.id)
      cursor = { ids: cursor?.updatedAt === last ? [...cursor.ids, ...idsAtLast] : idsAtLast, updatedAt: last }
    }
  }

  if (stopped) {
    result.hasMore = true
  }

  return result
}
