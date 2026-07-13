import { deleteStreamVideo, getStreamVideo, listStreamVideos } from '@/stream/api.js'
import { type BunnyStreamCredentials, BunnyStreamVideoStatus } from '@/stream/api.js'

import { log } from './log.js'

const getCredentials = (envPrefix?: string): BunnyStreamCredentials | null => {
  const prefix = envPrefix ? `BUNNY_${envPrefix}_` : 'BUNNY_'
  const apiKey = process.env[`${prefix}STREAM_API_KEY`]
  const libraryId = process.env[`${prefix}STREAM_LIBRARY_ID`]
  if (!apiKey || !libraryId) {
    return null
  }
  return { apiKey, libraryId }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export const waitForVideoProcessed = async (
  videoId: string,
  options: { envPrefix?: string; interval?: number; timeout?: number } = {},
): Promise<boolean> => {
  const { envPrefix, interval = 2000, timeout = 120000 } = options
  const credentials = getCredentials(envPrefix)

  if (!credentials) {
    log.warn('Bunny Stream credentials not found, skipping wait')
    return false
  }

  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      const video = await getStreamVideo({ ...credentials, videoId })

      if (video.status === BunnyStreamVideoStatus.Finished) {
        log.success(`Video ${videoId} finished processing`)
        return true
      }

      if (video.status === BunnyStreamVideoStatus.Error || video.status === BunnyStreamVideoStatus.UploadFailed) {
        log.error(`Video ${videoId} failed with status: ${video.status}`)
        return false
      }

      log.info(`Waiting for video ${videoId} to process (status: ${video.status})...`)
      await sleep(interval)
    } catch (err) {
      log.error(`Error checking video status: ${err instanceof Error ? err.message : String(err)}`)
      await sleep(interval)
    }
  }

  log.warn(`Timeout waiting for video ${videoId} to process`)
  return false
}

export const cleanupStreamVideos = async (
  patterns: string | string[],
  options: { envPrefix?: string } = {},
): Promise<void> => {
  const credentials = getCredentials(options.envPrefix)

  if (!credentials) {
    log.warn('Bunny Stream credentials not found, skipping video cleanup')
    return
  }

  const patternList = Array.isArray(patterns) ? patterns : [patterns]

  try {
    const data = await listStreamVideos({ ...credentials, itemsPerPage: 1000 })

    if (!data.items || data.items.length === 0) {
      log.info('No videos found in library')
      return
    }

    const matchingVideos = data.items.filter(
      (video) => video.title && patternList.some((pattern) => video.title!.includes(pattern)),
    )

    if (matchingVideos.length === 0) {
      log.info(`No videos found matching: ${patternList.join(', ')}`)
      return
    }

    log.info(`Found ${matchingVideos.length} video(s) matching: ${patternList.join(', ')}`)

    for (const video of matchingVideos) {
      try {
        await deleteStreamVideo({ ...credentials, videoId: video.guid })
        log.success(`Deleted video: ${video.guid}`)
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          log.info(`Video already deleted: ${video.guid}`)
        } else {
          log.error(`Failed to delete video ${video.guid}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
  } catch (err) {
    log.error(
      `Failed to cleanup videos for "${patternList.join(', ')}": ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
