import { HTTPError } from 'ky'

import { BUNNY_API, TIMEOUTS } from '@/utils/constants.js'
import { kyClient } from '@/utils/kyClient.js'

export enum BunnyStreamVideoStatus {
  Created = 0,
  Error = 5,
  Finished = 4,
  JitPlaylistsCreated = 8,
  JitSegmenting = 7,
  Processing = 2,
  Transcoding = 3,
  Uploaded = 1,
  UploadFailed = 6,
}

export interface BunnyStreamVideoResolutionsResponse {
  data: BunnyStreamVideoResolutions
  message: null | string
  statusCode: number
  success: boolean
}

export interface BunnyStreamVideoResolutions {
  availableResolutions: null | string[]
  configuredResolutions: null | string[]
  hasBothOldAndNewResolutionFormat: boolean
  hasOriginal: boolean
  mp4Resolutions:
    | {
        path: null | string
        resolution: null | string
      }[]
    | null
  oldResolutions:
    | {
        checksum: null | string
        contentType: null | string
        dateCreated: string
        guid: null | string
        isDirectory: boolean
        lastChanged: string
        length: number
        objectName: null | string
        path: null | string
        replicatedZones: null | string
        serverId: number
        storageZoneId: number
        storageZoneName: null | string
        userId: null | string
      }[]
    | null
  playlistResolutions:
    | {
        path: null | string
        resolution: null | string
      }[]
    | null
  storageObjects:
    | {
        checksum: null | string
        contentType: null | string
        dateCreated: string
        guid: null | string
        isDirectory: boolean
        lastChanged: string
        length: number
        objectName: null | string
        path: null | string
        replicatedZones: null | string
        serverId: number
        storageZoneId: number
        storageZoneName: null | string
        userId: null | string
      }[]
    | null
  storageResolutions:
    | {
        path: null | string
        resolution: null | string
      }[]
    | null
  videoId: null | string
  videoLibraryId: number
}

export interface BunnyStreamVideo {
  availableResolutions: null | string
  averageWatchTime: number
  captions:
    | {
        label: null | string
        srclang: null | string
        version: number
      }[]
    | null
  category: null | string
  chapters:
    | {
        end: number
        start: number
        title: string
      }[]
    | null
  collectionId: null | string
  dateUploaded: string
  description: null | string
  encodeProgress: number
  framerate: number
  guid: string
  hasMP4Fallback: boolean
  height: number
  isPublic: boolean
  jitEncodingEnabled: boolean | null
  length: number
  metaTags:
    | {
        property: null | string
        value: null | string
      }[]
    | null
  moments:
    | {
        label: string
        timestamp: number
      }[]
    | null
  outputCodecs: null | string
  rotation: null | number
  status: BunnyStreamVideoStatus
  storageSize: number
  thumbnailCount: number
  thumbnailFileName: null | string
  title: null | string
  totalWatchTime: number
  transcodingMessages:
    | {
        issueCode: number
        level: number
        message: null | string
        timeStamp: string
        value: null | string
      }[]
    | null
  videoLibraryId: number
  views: number
  width: number
}

export type BunnyStreamCredentials = {
  apiKey: string
  libraryId: number | string
}

export interface BunnyStreamListVideosResponse {
  currentPage: number
  items: BunnyStreamVideo[]
  itemsPerPage: number
  totalItems: number
}

export const getStreamVideo = async ({
  apiKey,
  libraryId,
  videoId,
}: { videoId: string } & BunnyStreamCredentials): Promise<BunnyStreamVideo> => {
  try {
    const response = await kyClient.get(`${BUNNY_API.STREAM_URL}/library/${libraryId}/videos/${videoId}`, {
      headers: {
        Accept: 'application/json',
        AccessKey: apiKey,
      },
      timeout: TIMEOUTS.DEFAULT,
    })

    const videoData = await response.json<BunnyStreamVideo>()
    return videoData
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 401) {
        throw new Error('Bunny Stream: Invalid API key', { cause: err })
      } else if (err.response.status === 404) {
        throw new Error(`Bunny Stream: Video not found: ${videoId}`, { cause: err })
      } else if (err.response.status === 500) {
        throw new Error('Bunny Stream: Server error', { cause: err })
      }
    }

    throw new Error(`Unable to get video: ${videoId}`, { cause: err })
  }
}

export const createStreamVideo = async ({
  apiKey,
  libraryId,
  thumbnailTime,
  title,
}: {
  thumbnailTime?: null | number
  title: string
} & BunnyStreamCredentials): Promise<BunnyStreamVideo> => {
  const data: {
    thumbnailTime?: null | number
    title: string
  } = {
    thumbnailTime: typeof thumbnailTime === 'number' ? thumbnailTime : null,
    title: title.trim(),
  }

  try {
    const response = await kyClient
      .post(`${BUNNY_API.STREAM_URL}/library/${libraryId}/videos`, {
        headers: {
          Accept: 'application/json',
          AccessKey: apiKey,
          'Content-Type': 'application/json',
        },
        json: data,
        timeout: TIMEOUTS.DEFAULT,
      })
      .json<BunnyStreamVideo>()

    return response
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 400) {
        throw new Error('Bunny Stream: Invalid request', { cause: err })
      } else if (err.response.status === 401) {
        throw new Error('Bunny Stream: Invalid API key', { cause: err })
      } else if (err.response.status === 500) {
        throw new Error('Bunny Stream: Server error', { cause: err })
      }
    }

    throw new Error(`Unable to create video: ${title}`, { cause: err })
  }
}

export const deleteStreamVideo = async ({
  apiKey,
  libraryId,
  videoId,
}: { videoId: string } & BunnyStreamCredentials): Promise<void> => {
  try {
    await kyClient.delete(`${BUNNY_API.STREAM_URL}/library/${libraryId}/videos/${videoId}`, {
      headers: {
        Accept: 'application/json',
        AccessKey: apiKey,
      },
      throwHttpErrors: (status) => status !== 404,
      timeout: TIMEOUTS.DEFAULT,
    })
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 401) {
        throw new Error('Bunny Stream: Invalid API key', { cause: err })
      } else if (err.response.status === 500) {
        throw new Error('Bunny Stream: Server error', { cause: err })
      }
    }

    throw new Error(`Unable to delete video: ${videoId}`, { cause: err })
  }
}

export const uploadStreamVideo = async ({
  apiKey,
  buffer,
  libraryId,
  timeout,
  videoId,
}: {
  buffer: Buffer
  timeout?: number
  videoId: string
} & BunnyStreamCredentials): Promise<void> => {
  try {
    await kyClient.put(`${BUNNY_API.STREAM_URL}/library/${libraryId}/videos/${videoId}`, {
      body: buffer as unknown as BodyInit,
      headers: {
        Accept: 'application/json',
        AccessKey: apiKey,
      },
      timeout: timeout ?? TIMEOUTS.STREAM_UPLOAD,
    })
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 400) {
        throw new Error('Bunny Stream: Video already uploaded', { cause: err })
      } else if (err.response.status === 401) {
        throw new Error('Bunny Stream: Invalid API key', { cause: err })
      } else if (err.response.status === 404) {
        throw new Error(`Bunny Stream: Video not found: ${videoId}`, { cause: err })
      } else if (err.response.status === 500) {
        throw new Error('Bunny Stream: Server error', { cause: err })
      }
    }

    throw new Error(`Unable to upload video: ${videoId}`, { cause: err })
  }
}

export const listStreamVideos = async ({
  apiKey,
  itemsPerPage = 100,
  libraryId,
  page = 1,
}: {
  itemsPerPage?: number
  page?: number
} & BunnyStreamCredentials): Promise<BunnyStreamListVideosResponse> => {
  try {
    const url = new URL(`${BUNNY_API.STREAM_URL}/library/${libraryId}/videos`)
    url.searchParams.set('page', String(page))
    url.searchParams.set('itemsPerPage', String(itemsPerPage))

    const response = await kyClient.get(url.toString(), {
      headers: {
        Accept: 'application/json',
        AccessKey: apiKey,
      },
      timeout: TIMEOUTS.DEFAULT,
    })

    return await response.json<BunnyStreamListVideosResponse>()
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 401) {
        throw new Error('Bunny Stream: Invalid API key', { cause: err })
      } else if (err.response.status === 500) {
        throw new Error('Bunny Stream: Server error', { cause: err })
      }
    }

    throw new Error('Unable to list videos', { cause: err })
  }
}

export const getStreamVideoResolutions = async ({
  apiKey,
  libraryId,
  videoId,
}: { videoId: string } & BunnyStreamCredentials): Promise<BunnyStreamVideoResolutionsResponse> => {
  try {
    const response = await kyClient.get(`${BUNNY_API.STREAM_URL}/library/${libraryId}/videos/${videoId}/resolutions`, {
      headers: {
        Accept: 'application/json',
        AccessKey: apiKey,
      },
      timeout: TIMEOUTS.DEFAULT,
    })

    return await response.json<BunnyStreamVideoResolutionsResponse>()
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 401) {
        throw new Error('Bunny Stream: Invalid API key', { cause: err })
      } else if (err.response.status === 404) {
        throw new Error(`Bunny Stream: Video with ID ${videoId} not found`, { cause: err })
      } else if (err.response.status === 500) {
        throw new Error('Bunny Stream: Server error', { cause: err })
      }
    }

    throw new Error(`Unable to get video resolutions: ${videoId}`, { cause: err })
  }
}

export const parseMp4Resolutions = (data: BunnyStreamVideoResolutions): { available: string[]; sorted: string[] } => {
  const available =
    data.mp4Resolutions?.map((r) => r.resolution).filter((resolution): resolution is string => Boolean(resolution)) ??
    []
  const sorted = [...available].toSorted((a, b) => parseInt(b.replace('p', '')) - parseInt(a.replace('p', '')))

  return { available, sorted }
}

export const canUploadToVideo = (status: BunnyStreamVideoStatus): boolean => {
  return status === BunnyStreamVideoStatus.Created
}

export const isVideoInErrorState = (status: BunnyStreamVideoStatus): boolean => {
  return status === BunnyStreamVideoStatus.Error || status === BunnyStreamVideoStatus.UploadFailed
}

export const isVideoProcessed = (status: BunnyStreamVideoStatus): boolean => {
  const processedStatuses = [
    BunnyStreamVideoStatus.Uploaded,
    BunnyStreamVideoStatus.Processing,
    BunnyStreamVideoStatus.Transcoding,
    BunnyStreamVideoStatus.Finished,
    BunnyStreamVideoStatus.JitSegmenting,
    BunnyStreamVideoStatus.JitPlaylistsCreated,
  ]

  return processedStatuses.includes(status)
}
