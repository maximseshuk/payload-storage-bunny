import type {
  BunnyStreamVideo,
  BunnyStreamVideoResolutionsResponse,
  NormalizedStreamConfig,
} from '@/types/index.js'

import { HTTPError } from 'ky'

import { BUNNY_API, TIMEOUTS } from '../constants.js'
import { kyClient } from '../kyClient.js'

export const getStreamVideo = async ({
  streamConfig,
  videoId,
}: {
  streamConfig: NormalizedStreamConfig
  videoId: string
}): Promise<BunnyStreamVideo> => {
  if (!streamConfig) {
    throw new Error('Stream configuration is required')
  }

  try {
    const response = await kyClient.get(`${BUNNY_API.STREAM_URL}/library/${streamConfig.libraryId}/videos/${videoId}`, {
      headers: {
        'Accept': 'application/json',
        'AccessKey': streamConfig.apiKey,
      },
      timeout: TIMEOUTS.DEFAULT,
    })

    const videoData = await response.json<BunnyStreamVideo>()
    return videoData
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 401) {
        throw new Error('Bunny Stream: Invalid API key')
      } else if (err.response.status === 404) {
        throw new Error(`Bunny Stream: Video not found: ${videoId}`)
      } else if (err.response.status === 500) {
        throw new Error('Bunny Stream: Server error')
      }
    }

    throw new Error(`Unable to get video: ${videoId}`)
  }
}

export const createStreamVideo = async ({
  streamConfig,
  thumbnailTime,
  title,
}: {
  streamConfig: NormalizedStreamConfig
  thumbnailTime?: number
  title: string
}): Promise<BunnyStreamVideo> => {
  if (!streamConfig) {
    throw new Error('Stream configuration is required')
  }

  const data: {
    thumbnailTime?: null | number
    title: string
  } = {
    title: title.trim(),
  }

  const finalThumbnailTime = thumbnailTime ?? streamConfig.thumbnailTime
  data.thumbnailTime = typeof finalThumbnailTime === 'number' ? finalThumbnailTime : null

  try {
    const response = await kyClient.post(`${BUNNY_API.STREAM_URL}/library/${streamConfig.libraryId}/videos`, {
      headers: {
        'Accept': 'application/json',
        'AccessKey': streamConfig.apiKey,
        'Content-Type': 'application/json',
      },
      json: data,
      timeout: TIMEOUTS.DEFAULT,
    }).json<BunnyStreamVideo>()

    return response
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 400) {
        throw new Error('Bunny Stream: Invalid request')
      } else if (err.response.status === 401) {
        throw new Error('Bunny Stream: Invalid API key')
      } else if (err.response.status === 500) {
        throw new Error('Bunny Stream: Server error')
      }
    }

    throw new Error(`Unable to create video: ${title}`)
  }
}

export const deleteStreamVideo = async ({
  streamConfig,
  videoId,
}: {
  streamConfig: NormalizedStreamConfig
  videoId: string
}): Promise<void> => {
  if (!streamConfig) {
    throw new Error('Stream configuration is required')
  }

  try {
    await kyClient.delete(`${BUNNY_API.STREAM_URL}/library/${streamConfig.libraryId}/videos/${videoId}`, {
      headers: {
        'Accept': 'application/json',
        'AccessKey': streamConfig.apiKey,
      },
      timeout: TIMEOUTS.DEFAULT,
    })
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 401) {
        throw new Error('Bunny Stream: Invalid API key')
      } else if (err.response.status === 404) {
        throw new Error(`Bunny Stream: Video not found: ${videoId}`)
      } else if (err.response.status === 500) {
        throw new Error('Bunny Stream: Server error')
      }
    }

    throw new Error(`Unable to delete video: ${videoId}`)
  }
}

export const uploadStreamVideo = async ({
  buffer,
  streamConfig,
  videoId,
}: {
  buffer: Buffer
  streamConfig: NormalizedStreamConfig
  videoId: string
}): Promise<void> => {
  if (!streamConfig) {
    throw new Error('Stream configuration is required')
  }

  try {
    await kyClient.put(`${BUNNY_API.STREAM_URL}/library/${streamConfig.libraryId}/videos/${videoId}`, {
      body: buffer,
      headers: {
        'Accept': 'application/json',
        'AccessKey': streamConfig.apiKey,
      },
      timeout: streamConfig.uploadTimeout || TIMEOUTS.STREAM_UPLOAD,
    })
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 400) {
        throw new Error('Bunny Stream: Video already uploaded')
      } else if (err.response.status === 401) {
        throw new Error('Bunny Stream: Invalid API key')
      } else if (err.response.status === 404) {
        throw new Error(`Bunny Stream: Video not found: ${videoId}`)
      } else if (err.response.status === 500) {
        throw new Error('Bunny Stream: Server error')
      }
    }

    throw new Error(`Unable to upload video: ${videoId}`)
  }
}

export const getStreamVideoResolutions = async ({
  streamConfig,
  videoId,
}: {
  streamConfig: NormalizedStreamConfig
  videoId: string
}): Promise<BunnyStreamVideoResolutionsResponse> => {
  if (!streamConfig) {
    throw new Error('Stream configuration is required')
  }

  try {
    const response = await kyClient.get(`${BUNNY_API.STREAM_URL}/library/${streamConfig.libraryId}/videos/${videoId}/resolutions`, {
      headers: {
        'Accept': 'application/json',
        'AccessKey': streamConfig.apiKey,
      },
      timeout: TIMEOUTS.DEFAULT,
    })

    return await response.json<BunnyStreamVideoResolutionsResponse>()
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 401) {
        throw new Error('Bunny Stream: Invalid API key')
      } else if (err.response.status === 404) {
        throw new Error(`Bunny Stream: Video with ID ${videoId} not found`)
      } else if (err.response.status === 500) {
        throw new Error('Bunny Stream: Server error')
      }
    }

    throw new Error(`Unable to get video resolutions: ${videoId}`)
  }
}
