import { bunnyRequest, isRateLimited } from '@/server/bunny/client.js'
import { httpFetch } from '@/server/http/index.js'
import { BUNNY_API, TIMEOUTS } from '@/shared/constants.js'
import type { BunnyStreamData, StreamVideoState } from '@/shared/types/index.js'

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
  timeout = TIMEOUTS.DEFAULT,
  videoId,
}: { timeout?: number; videoId: string } & BunnyStreamCredentials): Promise<BunnyStreamVideo> => {
  const res = await bunnyRequest({
    apiKey,
    genericError: `Unable to get video: ${videoId}`,
    method: 'get',
    statusErrors: {
      401: 'Bunny Stream: Invalid API key',
      404: `Bunny Stream: Video not found: ${videoId}`,
      500: 'Bunny Stream: Server error',
    },
    timeout,
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
    throw new Error(genericError, { cause: err })
  }
}

const STREAM_UPLOAD_URL_META_TAG = 'payload-storage-bunny:upload-url'
const STREAM_UPLOAD_LENGTH_META_TAG = 'payload-storage-bunny:upload-length'
const TUS_RESUMABLE = { 'Tus-Resumable': '1.0.0' }

export const createStreamTusUpload = async ({
  apiKey,
  headers,
  libraryId,
  metadata,
  size,
  videoId,
}: {
  headers: Record<string, string>
  metadata: Record<string, string>
  size: number
  videoId: string
} & BunnyStreamCredentials): Promise<string> => {
  let uploadUrl: string
  try {
    const res = await httpFetch(BUNNY_API.TUS_ENDPOINT, {
      headers: {
        ...headers,
        ...TUS_RESUMABLE,
        'Upload-Length': String(size),
        'Upload-Metadata': Object.entries(metadata)
          .map(([key, value]) => `${key} ${Buffer.from(value).toString('base64')}`)
          .join(','),
      },
      method: 'post',
      timeout: TIMEOUTS.DEFAULT,
    })
    const location = res.headers.get('Location')
    if (!location) {
      throw new Error('Bunny Stream: TUS response has no Location')
    }
    uploadUrl = new URL(location, BUNNY_API.TUS_ENDPOINT).toString()
  } catch (err) {
    throw new Error(`Unable to create TUS upload: ${videoId}`, { cause: err })
  }

  await bunnyRequest({
    apiKey,
    contentType: 'application/json',
    genericError: `Unable to update video: ${videoId}`,
    json: {
      metaTags: [
        { property: STREAM_UPLOAD_URL_META_TAG, value: uploadUrl },
        { property: STREAM_UPLOAD_LENGTH_META_TAG, value: String(size) },
      ],
    },
    method: 'post',
    statusErrors: {
      401: 'Bunny Stream: Invalid API key',
      404: `Bunny Stream: Video not found: ${videoId}`,
      500: 'Bunny Stream: Server error',
    },
    timeout: TIMEOUTS.DEFAULT,
    url: `${BUNNY_API.STREAM_URL}/library/${libraryId}/videos/${videoId}`,
  })

  return uploadUrl
}

export const getStreamTusUpload = ({
  metaTags,
}: Pick<BunnyStreamVideo, 'metaTags'>): undefined | { length: number; url: string } => {
  const read = (name: string) => metaTags?.find(({ property }) => property === name)?.value
  const url = read(STREAM_UPLOAD_URL_META_TAG)
  const length = Number(read(STREAM_UPLOAD_LENGTH_META_TAG))
  return url && length > 0 ? { length, url } : undefined
}

export const getStreamTusUploadOffset = async ({
  headers,
  uploadUrl,
}: {
  headers: Record<string, string>
  uploadUrl: string
}): Promise<{ length: number; offset: number }> => {
  try {
    const res = await httpFetch(uploadUrl, {
      headers: { ...headers, ...TUS_RESUMABLE },
      method: 'head',
      timeout: TIMEOUTS.DEFAULT,
    })
    return { length: Number(res.headers.get('Upload-Length')), offset: Number(res.headers.get('Upload-Offset')) }
  } catch (err) {
    throw new Error(`Unable to read TUS upload: ${uploadUrl}`, { cause: err })
  }
}

export const getStreamVideoOriginalSize = async ({
  apiKey,
  libraryId,
  videoId,
}: { videoId: string } & BunnyStreamCredentials): Promise<number> => {
  const res = await bunnyRequest({
    apiKey,
    genericError: `Unable to get video storage: ${videoId}`,
    method: 'get',
    statusErrors: {
      401: 'Bunny Stream: Invalid API key',
      404: `Bunny Stream: Video not found: ${videoId}`,
      500: 'Bunny Stream: Server error',
    },
    timeout: TIMEOUTS.DEFAULT,
    url: `${BUNNY_API.STREAM_URL}/library/${libraryId}/videos/${videoId}/storage`,
  })

  return (await res.json<{ data?: { originals?: number } | null }>()).data?.originals ?? 0
}

export const deleteStreamVideo = async ({
  apiKey,
  libraryId,
  timeout = TIMEOUTS.DEFAULT,
  videoId,
}: { timeout?: number; videoId: string } & BunnyStreamCredentials): Promise<void> => {
  await bunnyRequest({
    apiKey,
    genericError: `Unable to delete video: ${videoId}`,
    method: 'delete',
    statusErrors: {
      401: 'Bunny Stream: Invalid API key',
      500: 'Bunny Stream: Server error',
    },
    throwHttpErrors: (status) => status !== 404,
    timeout,
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
  timeout = TIMEOUTS.DEFAULT,
}: {
  itemsPerPage?: number
  page?: number
  timeout?: number
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
    timeout,
    url: url.toString(),
  })

  return res.json<BunnyStreamListVideosResponse>()
}

export const getStreamVideoResolutions = async ({
  apiKey,
  libraryId,
  timeout = TIMEOUTS.DEFAULT,
  videoId,
}: { timeout?: number; videoId: string } & BunnyStreamCredentials): Promise<BunnyStreamVideoResolutionsResponse> => {
  const res = await bunnyRequest({
    apiKey,
    genericError: `Unable to get video resolutions: ${videoId}`,
    method: 'get',
    statusErrors: {
      401: 'Bunny Stream: Invalid API key',
      404: `Bunny Stream: Video with ID ${videoId} not found`,
      500: 'Bunny Stream: Server error',
    },
    timeout,
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

type StreamLogger = { error: (obj: object) => void }

export const isMissingResolutions = ({
  encoded,
  mp4Fallback,
  resolutions,
}: {
  encoded: boolean
  mp4Fallback?: boolean
  resolutions?: BunnyStreamData['resolutions'] | null
}): boolean => encoded && Boolean(mp4Fallback) && !resolutions?.available?.length

export const getReadyResolutions = async ({
  apiKey,
  encoded,
  libraryId,
  logger,
  mp4Fallback,
  resolutions,
  timeout,
  videoId,
}: {
  encoded: boolean
  logger: StreamLogger
  mp4Fallback?: boolean
  resolutions?: BunnyStreamData['resolutions']
  timeout?: number
  videoId: string
} & BunnyStreamCredentials): Promise<BunnyStreamData['resolutions']> => {
  if (!isMissingResolutions({ encoded, mp4Fallback, resolutions })) {
    return resolutions
  }
  try {
    const res = await getStreamVideoResolutions({ apiKey, libraryId, timeout, videoId })
    if (res.success && res.data.mp4Resolutions) {
      const { available, sorted } = parseMp4Resolutions(res.data)
      if (available.length > 0) {
        return { available, highest: sorted[0] }
      }
    }
  } catch (err) {
    logger.error({ err, msg: '[bunny:stream] failed to fetch resolutions', videoId })
    if (isRateLimited(err)) {
      throw err
    }
  }
  return resolutions
}

export const isVideoInErrorState = (status: BunnyStreamVideoStatus): boolean => {
  return status === BunnyStreamVideoStatus.Error || status === BunnyStreamVideoStatus.UploadFailed
}

export const isVideoEncoded = (status: BunnyStreamVideoStatus): boolean =>
  status === BunnyStreamVideoStatus.Finished || status === BunnyStreamVideoStatus.JitPlaylistsCreated

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

export const getStreamVideoState = ({ status }: Pick<BunnyStreamVideo, 'status'>): StreamVideoState => {
  if (isVideoInErrorState(status)) {
    return 'failed'
  }
  if (isVideoEncoded(status)) {
    return 'ready'
  }
  return 'processing'
}

export const getStreamSaveState = async ({
  video,
  ...args
}: {
  logger: StreamLogger
  mp4Fallback?: boolean
  video: Pick<BunnyStreamVideo, 'availableResolutions' | 'guid' | 'status'>
} & BunnyStreamCredentials): Promise<{
  resolutions?: BunnyStreamData['resolutions'] | null
  status: StreamVideoState
}> => {
  const encoded = isVideoEncoded(video.status)
  const resolutions = await getReadyResolutions({ ...args, encoded, videoId: video.guid }).catch(() => undefined)
  return {
    resolutions: args.mp4Fallback ? (resolutions ?? null) : undefined,
    status: isMissingResolutions({ encoded, mp4Fallback: args.mp4Fallback, resolutions })
      ? 'processing'
      : getStreamVideoState(video),
  }
}

const WEBHOOK_VIDEO_STATES: Partial<Record<number, StreamVideoState>> = {
  0: 'processing',
  1: 'processing',
  2: 'processing',
  3: 'ready',
  4: 'processing',
  5: 'failed',
  6: 'processing',
  7: 'processing',
  8: 'failed',
}

export const getWebhookVideoState = (status: number): StreamVideoState | undefined => WEBHOOK_VIDEO_STATES[status]
