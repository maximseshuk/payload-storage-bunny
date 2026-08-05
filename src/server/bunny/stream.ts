import { bunnyRequest } from '@/server/bunny/client.js'
import { HTTPError } from '@/server/http/index.js'
import { BUNNY_API, TIMEOUTS } from '@/shared/constants.js'

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
  const res = await bunnyRequest({
    apiKey,
    genericError: `Unable to get video: ${videoId}`,
    method: 'get',
    statusErrors: {
      401: 'Bunny Stream: Invalid API key',
      404: `Bunny Stream: Video not found: ${videoId}`,
      500: 'Bunny Stream: Server error',
    },
    timeout: TIMEOUTS.DEFAULT,
    url: `${BUNNY_API.STREAM_URL}/library/${libraryId}/videos/${videoId}`,
  })

  return res.json<BunnyStreamVideo>()
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

  const statusErrors = {
    400: 'Bunny Stream: Invalid request',
    401: 'Bunny Stream: Invalid API key',
    500: 'Bunny Stream: Server error',
  }
  const genericError = `Unable to create video: ${title}`

  const res = await bunnyRequest({
    apiKey,
    contentType: 'application/json',
    genericError,
    json: data,
    method: 'post',
    statusErrors,
    timeout: TIMEOUTS.DEFAULT,
    url: `${BUNNY_API.STREAM_URL}/library/${libraryId}/videos`,
  })

  try {
    return await res.json<BunnyStreamVideo>()
  } catch (err) {
    if (err instanceof HTTPError && statusErrors[err.response.status as keyof typeof statusErrors]) {
      throw new Error(statusErrors[err.response.status as keyof typeof statusErrors], { cause: err })
    }
    throw new Error(genericError, { cause: err })
  }
}

export const deleteStreamVideo = async ({
  apiKey,
  libraryId,
  videoId,
}: { videoId: string } & BunnyStreamCredentials): Promise<void> => {
  await bunnyRequest({
    apiKey,
    genericError: `Unable to delete video: ${videoId}`,
    method: 'delete',
    statusErrors: {
      401: 'Bunny Stream: Invalid API key',
      500: 'Bunny Stream: Server error',
    },
    throwHttpErrors: (status) => status !== 404,
    timeout: TIMEOUTS.DEFAULT,
    url: `${BUNNY_API.STREAM_URL}/library/${libraryId}/videos/${videoId}`,
  })
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
  await bunnyRequest({
    apiKey,
    body: buffer as unknown as BodyInit,
    genericError: `Unable to upload video: ${videoId}`,
    method: 'put',
    statusErrors: {
      400: 'Bunny Stream: Video already uploaded',
      401: 'Bunny Stream: Invalid API key',
      404: `Bunny Stream: Video not found: ${videoId}`,
      500: 'Bunny Stream: Server error',
    },
    timeout: timeout ?? TIMEOUTS.STREAM_UPLOAD,
    url: `${BUNNY_API.STREAM_URL}/library/${libraryId}/videos/${videoId}`,
  })
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
  const url = new URL(`${BUNNY_API.STREAM_URL}/library/${libraryId}/videos`)
  url.searchParams.set('page', String(page))
  url.searchParams.set('itemsPerPage', String(itemsPerPage))

  const res = await bunnyRequest({
    apiKey,
    genericError: 'Unable to list videos',
    method: 'get',
    statusErrors: {
      401: 'Bunny Stream: Invalid API key',
      500: 'Bunny Stream: Server error',
    },
    timeout: TIMEOUTS.DEFAULT,
    url: url.toString(),
  })

  return res.json<BunnyStreamListVideosResponse>()
}

export const getStreamVideoResolutions = async ({
  apiKey,
  libraryId,
  videoId,
}: { videoId: string } & BunnyStreamCredentials): Promise<BunnyStreamVideoResolutionsResponse> => {
  const res = await bunnyRequest({
    apiKey,
    genericError: `Unable to get video resolutions: ${videoId}`,
    method: 'get',
    statusErrors: {
      401: 'Bunny Stream: Invalid API key',
      404: `Bunny Stream: Video with ID ${videoId} not found`,
      500: 'Bunny Stream: Server error',
    },
    timeout: TIMEOUTS.DEFAULT,
    url: `${BUNNY_API.STREAM_URL}/library/${libraryId}/videos/${videoId}/resolutions`,
  })

  return res.json<BunnyStreamVideoResolutionsResponse>()
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
