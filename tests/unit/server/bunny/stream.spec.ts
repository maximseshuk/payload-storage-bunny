import { beforeEach, describe, expect, it, vi } from 'vitest'

import { httpError } from '../../../helpers/unit/httpError.js'

const { deleteMock, getMock, postMock, putMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
}))

vi.mock('ky', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ky')>()),
  default: {
    create: () => ({
      delete: deleteMock,
      get: getMock,
      post: postMock,
      put: putMock,
    }),
  },
}))

const {
  BunnyStreamVideoStatus,
  canUploadToVideo,
  createStreamVideo,
  deleteStreamVideo,
  getStreamVideo,
  getStreamVideoResolutions,
  isVideoInErrorState,
  isVideoProcessed,
  listStreamVideos,
  parseMp4Resolutions,
  uploadStreamVideo,
} = await import('@/server/bunny/stream.js')

const jsonResponse = (data: unknown) => ({ json: () => Promise.resolve(data) })

const creds = { apiKey: 'stream-key', libraryId: 42 }

beforeEach(() => {
  deleteMock.mockReset()
  getMock.mockReset()
  postMock.mockReset()
  putMock.mockReset()
})

describe('getStreamVideo', () => {
  it('GETs the video URL with headers/timeout and returns parsed JSON', async () => {
    const video = { guid: 'vid-1', title: 'hello' }
    getMock.mockResolvedValue(jsonResponse(video))

    const result = await getStreamVideo({ ...creds, videoId: 'vid-1' })

    expect(result).toEqual(video)
    expect(getMock).toHaveBeenCalledWith('https://video.bunnycdn.com/library/42/videos/vid-1', {
      headers: { Accept: 'application/json', AccessKey: 'stream-key' },
      timeout: 15000,
    })
  })

  it('maps 401 to invalid API key', async () => {
    getMock.mockRejectedValue(httpError(401))
    await expect(getStreamVideo({ ...creds, videoId: 'vid-1' })).rejects.toThrow('Bunny Stream: Invalid API key')
  })

  it('maps 404 to video not found', async () => {
    getMock.mockRejectedValue(httpError(404))
    await expect(getStreamVideo({ ...creds, videoId: 'vid-1' })).rejects.toThrow('Bunny Stream: Video not found: vid-1')
  })

  it('maps 500 to server error', async () => {
    getMock.mockRejectedValue(httpError(500))
    await expect(getStreamVideo({ ...creds, videoId: 'vid-1' })).rejects.toThrow('Bunny Stream: Server error')
  })

  it('falls back to generic message for other HTTPError statuses', async () => {
    getMock.mockRejectedValue(httpError(400))
    await expect(getStreamVideo({ ...creds, videoId: 'vid-1' })).rejects.toThrow('Unable to get video: vid-1')
  })

  it('falls back to generic message for non-HTTP errors', async () => {
    getMock.mockRejectedValue(new Error('boom'))
    await expect(getStreamVideo({ ...creds, videoId: 'vid-1' })).rejects.toThrow('Unable to get video: vid-1')
  })
})

describe('createStreamVideo', () => {
  it('POSTs a trimmed title and numeric thumbnailTime with JSON headers', async () => {
    const created = { guid: 'new-vid' }
    postMock.mockReturnValue(jsonResponse(created))

    const result = await createStreamVideo({ ...creds, thumbnailTime: 12, title: '  My Video  ' })

    expect(result).toEqual(created)
    expect(postMock).toHaveBeenCalledWith('https://video.bunnycdn.com/library/42/videos', {
      headers: { Accept: 'application/json', AccessKey: 'stream-key', 'Content-Type': 'application/json' },
      json: { thumbnailTime: 12, title: 'My Video' },
      timeout: 15000,
    })
  })

  it('defaults thumbnailTime to null when not a number', async () => {
    postMock.mockReturnValue(jsonResponse({ guid: 'x' }))

    await createStreamVideo({ ...creds, title: 'Clip' })

    expect(postMock.mock.calls[0][1]).toMatchObject({ json: { thumbnailTime: null, title: 'Clip' } })
  })

  it('maps 400 to invalid request', async () => {
    postMock.mockReturnValue({ json: () => Promise.reject(httpError(400)) })
    await expect(createStreamVideo({ ...creds, title: 'Clip' })).rejects.toThrow('Bunny Stream: Invalid request')
  })

  it('maps 401 to invalid API key', async () => {
    postMock.mockReturnValue({ json: () => Promise.reject(httpError(401)) })
    await expect(createStreamVideo({ ...creds, title: 'Clip' })).rejects.toThrow('Bunny Stream: Invalid API key')
  })

  it('maps 500 to server error', async () => {
    postMock.mockReturnValue({ json: () => Promise.reject(httpError(500)) })
    await expect(createStreamVideo({ ...creds, title: 'Clip' })).rejects.toThrow('Bunny Stream: Server error')
  })

  it('falls back to generic message for other HTTPError statuses', async () => {
    postMock.mockReturnValue({ json: () => Promise.reject(httpError(404)) })
    await expect(createStreamVideo({ ...creds, title: 'Clip' })).rejects.toThrow('Unable to create video: Clip')
  })

  it('falls back to generic message for non-HTTP errors', async () => {
    postMock.mockReturnValue({ json: () => Promise.reject(new Error('boom')) })
    await expect(createStreamVideo({ ...creds, title: 'Clip' })).rejects.toThrow('Unable to create video: Clip')
  })
})

describe('deleteStreamVideo', () => {
  it('DELETEs the video URL, tolerating 404 via throwHttpErrors', async () => {
    deleteMock.mockResolvedValue(undefined)

    await deleteStreamVideo({ ...creds, videoId: 'vid-1' })

    expect(deleteMock).toHaveBeenCalledTimes(1)
    const [url, options] = deleteMock.mock.calls[0]
    expect(url).toBe('https://video.bunnycdn.com/library/42/videos/vid-1')
    expect(options).toMatchObject({
      headers: { Accept: 'application/json', AccessKey: 'stream-key' },
      timeout: 15000,
    })
    expect(options.throwHttpErrors(404)).toBe(false)
    expect(options.throwHttpErrors(401)).toBe(true)
  })

  it('maps 401 to invalid API key', async () => {
    deleteMock.mockRejectedValue(httpError(401))
    await expect(deleteStreamVideo({ ...creds, videoId: 'vid-1' })).rejects.toThrow('Bunny Stream: Invalid API key')
  })

  it('maps 500 to server error', async () => {
    deleteMock.mockRejectedValue(httpError(500))
    await expect(deleteStreamVideo({ ...creds, videoId: 'vid-1' })).rejects.toThrow('Bunny Stream: Server error')
  })

  it('falls back to generic message for other HTTPError statuses', async () => {
    deleteMock.mockRejectedValue(httpError(400))
    await expect(deleteStreamVideo({ ...creds, videoId: 'vid-1' })).rejects.toThrow('Unable to delete video: vid-1')
  })

  it('falls back to generic message for non-HTTP errors', async () => {
    deleteMock.mockRejectedValue(new Error('boom'))
    await expect(deleteStreamVideo({ ...creds, videoId: 'vid-1' })).rejects.toThrow('Unable to delete video: vid-1')
  })
})

describe('uploadStreamVideo', () => {
  it('PUTs the buffer with the default stream-upload timeout', async () => {
    putMock.mockResolvedValue(undefined)
    const buffer = Buffer.from('video-bytes')

    await uploadStreamVideo({ ...creds, buffer, videoId: 'vid-1' })

    expect(putMock).toHaveBeenCalledWith('https://video.bunnycdn.com/library/42/videos/vid-1', {
      body: buffer,
      headers: { Accept: 'application/json', AccessKey: 'stream-key' },
      timeout: 300000,
    })
  })

  it('passes an explicit timeout through', async () => {
    putMock.mockResolvedValue(undefined)

    await uploadStreamVideo({ ...creds, buffer: Buffer.from('x'), timeout: 600000, videoId: 'vid-1' })

    expect(putMock.mock.calls[0][1]).toMatchObject({ timeout: 600000 })
  })

  it('maps 400 to already uploaded', async () => {
    putMock.mockRejectedValue(httpError(400))
    await expect(uploadStreamVideo({ ...creds, buffer: Buffer.from('x'), videoId: 'vid-1' })).rejects.toThrow(
      'Bunny Stream: Video already uploaded',
    )
  })

  it('maps 401 to invalid API key', async () => {
    putMock.mockRejectedValue(httpError(401))
    await expect(uploadStreamVideo({ ...creds, buffer: Buffer.from('x'), videoId: 'vid-1' })).rejects.toThrow(
      'Bunny Stream: Invalid API key',
    )
  })

  it('maps 404 to video not found', async () => {
    putMock.mockRejectedValue(httpError(404))
    await expect(uploadStreamVideo({ ...creds, buffer: Buffer.from('x'), videoId: 'vid-1' })).rejects.toThrow(
      'Bunny Stream: Video not found: vid-1',
    )
  })

  it('maps 500 to server error', async () => {
    putMock.mockRejectedValue(httpError(500))
    await expect(uploadStreamVideo({ ...creds, buffer: Buffer.from('x'), videoId: 'vid-1' })).rejects.toThrow(
      'Bunny Stream: Server error',
    )
  })

  it('falls back to generic message for other HTTPError statuses', async () => {
    putMock.mockRejectedValue(httpError(403))
    await expect(uploadStreamVideo({ ...creds, buffer: Buffer.from('x'), videoId: 'vid-1' })).rejects.toThrow(
      'Unable to upload video: vid-1',
    )
  })

  it('falls back to generic message for non-HTTP errors', async () => {
    putMock.mockRejectedValue(new Error('boom'))
    await expect(uploadStreamVideo({ ...creds, buffer: Buffer.from('x'), videoId: 'vid-1' })).rejects.toThrow(
      'Unable to upload video: vid-1',
    )
  })
})

describe('listStreamVideos', () => {
  it('GETs with default page and itemsPerPage searchParams', async () => {
    const list = { currentPage: 1, items: [], itemsPerPage: 100, totalItems: 0 }
    getMock.mockResolvedValue(jsonResponse(list))

    const result = await listStreamVideos({ ...creds })

    expect(result).toEqual(list)
    expect(getMock.mock.calls[0][0]).toBe('https://video.bunnycdn.com/library/42/videos?page=1&itemsPerPage=100')
    expect(getMock.mock.calls[0][1]).toMatchObject({
      headers: { Accept: 'application/json', AccessKey: 'stream-key' },
      timeout: 15000,
    })
  })

  it('passes explicit page and itemsPerPage', async () => {
    getMock.mockResolvedValue(jsonResponse({ items: [] }))

    await listStreamVideos({ ...creds, itemsPerPage: 25, page: 3 })

    expect(getMock.mock.calls[0][0]).toBe('https://video.bunnycdn.com/library/42/videos?page=3&itemsPerPage=25')
  })

  it('maps 401 to invalid API key', async () => {
    getMock.mockRejectedValue(httpError(401))
    await expect(listStreamVideos({ ...creds })).rejects.toThrow('Bunny Stream: Invalid API key')
  })

  it('maps 500 to server error', async () => {
    getMock.mockRejectedValue(httpError(500))
    await expect(listStreamVideos({ ...creds })).rejects.toThrow('Bunny Stream: Server error')
  })

  it('falls back to generic message for other HTTPError statuses', async () => {
    getMock.mockRejectedValue(httpError(404))
    await expect(listStreamVideos({ ...creds })).rejects.toThrow('Unable to list videos')
  })

  it('falls back to generic message for non-HTTP errors', async () => {
    getMock.mockRejectedValue(new Error('boom'))
    await expect(listStreamVideos({ ...creds })).rejects.toThrow('Unable to list videos')
  })
})

describe('getStreamVideoResolutions', () => {
  it('GETs the resolutions URL and returns parsed JSON', async () => {
    const payload = { data: { mp4Resolutions: [] }, message: null, statusCode: 200, success: true }
    getMock.mockResolvedValue(jsonResponse(payload))

    const result = await getStreamVideoResolutions({ ...creds, videoId: 'vid-1' })

    expect(result).toEqual(payload)
    expect(getMock).toHaveBeenCalledWith('https://video.bunnycdn.com/library/42/videos/vid-1/resolutions', {
      headers: { Accept: 'application/json', AccessKey: 'stream-key' },
      timeout: 15000,
    })
  })

  it('maps 401 to invalid API key', async () => {
    getMock.mockRejectedValue(httpError(401))
    await expect(getStreamVideoResolutions({ ...creds, videoId: 'vid-1' })).rejects.toThrow(
      'Bunny Stream: Invalid API key',
    )
  })

  it('maps 404 to video not found', async () => {
    getMock.mockRejectedValue(httpError(404))
    await expect(getStreamVideoResolutions({ ...creds, videoId: 'vid-1' })).rejects.toThrow(
      'Bunny Stream: Video with ID vid-1 not found',
    )
  })

  it('maps 500 to server error', async () => {
    getMock.mockRejectedValue(httpError(500))
    await expect(getStreamVideoResolutions({ ...creds, videoId: 'vid-1' })).rejects.toThrow(
      'Bunny Stream: Server error',
    )
  })

  it('falls back to generic message for other HTTPError statuses', async () => {
    getMock.mockRejectedValue(httpError(400))
    await expect(getStreamVideoResolutions({ ...creds, videoId: 'vid-1' })).rejects.toThrow(
      'Unable to get video resolutions: vid-1',
    )
  })

  it('falls back to generic message for non-HTTP errors', async () => {
    getMock.mockRejectedValue(new Error('boom'))
    await expect(getStreamVideoResolutions({ ...creds, videoId: 'vid-1' })).rejects.toThrow(
      'Unable to get video resolutions: vid-1',
    )
  })
})

describe('parseMp4Resolutions', () => {
  const base = {
    availableResolutions: null,
    configuredResolutions: null,
    hasBothOldAndNewResolutionFormat: false,
    hasOriginal: false,
    oldResolutions: null,
    playlistResolutions: null,
    storageObjects: null,
    storageResolutions: null,
    videoId: 'vid-1',
    videoLibraryId: 42,
  }

  it('returns empty arrays when mp4Resolutions is null', () => {
    expect(parseMp4Resolutions({ ...base, mp4Resolutions: null })).toEqual({ available: [], sorted: [] })
  })

  it('returns empty arrays when mp4Resolutions is empty', () => {
    expect(parseMp4Resolutions({ ...base, mp4Resolutions: [] })).toEqual({ available: [], sorted: [] })
  })

  it('filters out null resolutions and sorts descending by numeric value', () => {
    const result = parseMp4Resolutions({
      ...base,
      mp4Resolutions: [
        { path: null, resolution: '360p' },
        { path: null, resolution: '1080p' },
        { path: null, resolution: null },
        { path: null, resolution: '720p' },
      ],
    })

    expect(result.available).toEqual(['360p', '1080p', '720p'])
    expect(result.sorted).toEqual(['1080p', '720p', '360p'])
  })
})

describe('canUploadToVideo', () => {
  it('is true only for Created', () => {
    expect(canUploadToVideo(BunnyStreamVideoStatus.Created)).toBe(true)
  })

  it.each([
    BunnyStreamVideoStatus.Uploaded,
    BunnyStreamVideoStatus.Processing,
    BunnyStreamVideoStatus.Transcoding,
    BunnyStreamVideoStatus.Finished,
    BunnyStreamVideoStatus.Error,
    BunnyStreamVideoStatus.UploadFailed,
    BunnyStreamVideoStatus.JitSegmenting,
    BunnyStreamVideoStatus.JitPlaylistsCreated,
  ])('is false for status %s', (status) => {
    expect(canUploadToVideo(status)).toBe(false)
  })
})

describe('isVideoInErrorState', () => {
  it.each([BunnyStreamVideoStatus.Error, BunnyStreamVideoStatus.UploadFailed])('is true for status %s', (status) => {
    expect(isVideoInErrorState(status)).toBe(true)
  })

  it.each([
    BunnyStreamVideoStatus.Created,
    BunnyStreamVideoStatus.Uploaded,
    BunnyStreamVideoStatus.Processing,
    BunnyStreamVideoStatus.Transcoding,
    BunnyStreamVideoStatus.Finished,
    BunnyStreamVideoStatus.JitSegmenting,
    BunnyStreamVideoStatus.JitPlaylistsCreated,
  ])('is false for status %s', (status) => {
    expect(isVideoInErrorState(status)).toBe(false)
  })
})

describe('isVideoProcessed', () => {
  it.each([
    BunnyStreamVideoStatus.Uploaded,
    BunnyStreamVideoStatus.Processing,
    BunnyStreamVideoStatus.Transcoding,
    BunnyStreamVideoStatus.Finished,
    BunnyStreamVideoStatus.JitSegmenting,
    BunnyStreamVideoStatus.JitPlaylistsCreated,
  ])('is true for processed status %s', (status) => {
    expect(isVideoProcessed(status)).toBe(true)
  })

  it.each([BunnyStreamVideoStatus.Created, BunnyStreamVideoStatus.Error, BunnyStreamVideoStatus.UploadFailed])(
    'is false for status %s',
    (status) => {
      expect(isVideoProcessed(status)).toBe(false)
    },
  )
})
