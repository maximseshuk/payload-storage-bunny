import type {
  BunnyStreamCredentials,
  BunnyStreamListVideosResponse,
  BunnyStreamVideo,
  BunnyStreamVideoResolutionsResponse,
} from '@/types/index.js'

import { HTTPError } from 'ky'

import { BUNNY_API, TIMEOUTS } from '../constants.js'
import { kyClient } from '../kyClient.js'

export type { BunnyStreamCredentials, BunnyStreamListVideosResponse }

export const getStreamVideo = async ({
  apiKey,
  libraryId,
  videoId,
}: { videoId: string } & BunnyStreamCredentials): Promise<BunnyStreamVideo> => {
  try {
    const response = await kyClient.get(
      `${BUNNY_API.STREAM_URL}/library/${libraryId}/videos/${videoId}`,
      {
        headers: {
          'Accept': 'application/json',
          'AccessKey': apiKey,
        },
        timeout: TIMEOUTS.DEFAULT,
      },
    )

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
    const response = await kyClient.post(
      `${BUNNY_API.STREAM_URL}/library/${libraryId}/videos`,
      {
        headers: {
          'Accept': 'application/json',
          'AccessKey': apiKey,
          'Content-Type': 'application/json',
        },
        json: data,
        timeout: TIMEOUTS.DEFAULT,
      },
    ).json<BunnyStreamVideo>()

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
  apiKey,
  libraryId,
  videoId,
}: { videoId: string } & BunnyStreamCredentials): Promise<void> => {
  try {
    await kyClient.delete(
      `${BUNNY_API.STREAM_URL}/library/${libraryId}/videos/${videoId}`,
      {
        headers: {
          'Accept': 'application/json',
          'AccessKey': apiKey,
        },
        throwHttpErrors: (status) => status !== 404,
        timeout: TIMEOUTS.DEFAULT,
      },
    )
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 401) {
        throw new Error('Bunny Stream: Invalid API key')
      } else if (err.response.status === 500) {
        throw new Error('Bunny Stream: Server error')
      }
    }

    throw new Error(`Unable to delete video: ${videoId}`)
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
    await kyClient.put(
      `${BUNNY_API.STREAM_URL}/library/${libraryId}/videos/${videoId}`,
      {
        body: buffer as unknown as BodyInit,
        headers: {
          'Accept': 'application/json',
          'AccessKey': apiKey,
        },
        timeout: timeout ?? TIMEOUTS.STREAM_UPLOAD,
      },
    )
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
        'Accept': 'application/json',
        'AccessKey': apiKey,
      },
      timeout: TIMEOUTS.DEFAULT,
    })

    return await response.json<BunnyStreamListVideosResponse>()
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 401) {
        throw new Error('Bunny Stream: Invalid API key')
      } else if (err.response.status === 500) {
        throw new Error('Bunny Stream: Server error')
      }
    }

    throw new Error('Unable to list videos')
  }
}

export const getStreamVideoResolutions = async ({
  apiKey,
  libraryId,
  videoId,
}: { videoId: string } & BunnyStreamCredentials): Promise<BunnyStreamVideoResolutionsResponse> => {
  try {
    const response = await kyClient.get(
      `${BUNNY_API.STREAM_URL}/library/${libraryId}/videos/${videoId}/resolutions`,
      {
        headers: {
          'Accept': 'application/json',
          'AccessKey': apiKey,
        },
        timeout: TIMEOUTS.DEFAULT,
      },
    )

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
