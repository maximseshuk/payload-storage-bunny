import { beforeEach, describe, expect, it, vi } from 'vitest'

import { httpError } from '../../../helpers/unit/httpError.js'

const { kyMethods, mockKy } = await vi.hoisted(() => import('../../../helpers/unit/kyMock.js'))
vi.mock('ky', mockKy)

const { delete: deleteMock, get: getMock, post: postMock, put: putMock } = kyMethods

const {
  BunnyStreamVideoStatus,
  canUploadToVideo,
  createStreamVideo,
  deleteStreamVideo,
  getReadyResolutions,
  getStreamSaveState,
  getStreamVideo,
  getStreamVideoState,
  getStreamVideoResolutions,
  getWebhookVideoState,
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
  it('sends a GET to the video URL with headers and timeout and returns the parsed JSON', async () => {
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

  it('falls back to the generic message for other HTTPError statuses', async () => {
    getMock.mockRejectedValue(httpError(400))
    await expect(getStreamVideo({ ...creds, videoId: 'vid-1' })).rejects.toThrow('Unable to get video: vid-1')
  })
})

describe('createStreamVideo', () => {
  it('sends a POST with a trimmed title, a numeric thumbnailTime and JSON headers', async () => {
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

  it('defaults thumbnailTime to null when it is not a number', async () => {
    postMock.mockReturnValue(jsonResponse({ guid: 'x' }))

    await createStreamVideo({ ...creds, title: 'Clip' })

    expect(postMock.mock.calls[0][1]).toMatchObject({ json: { thumbnailTime: null, title: 'Clip' } })
  })

  it('maps 400 to invalid request', async () => {
    postMock.mockRejectedValue(httpError(400))
    await expect(createStreamVideo({ ...creds, title: 'Clip' })).rejects.toThrow('Bunny Stream: Invalid request')
  })

  it('maps 401 to invalid API key', async () => {
    postMock.mockRejectedValue(httpError(401))
    await expect(createStreamVideo({ ...creds, title: 'Clip' })).rejects.toThrow('Bunny Stream: Invalid API key')
  })

  it('maps 500 to server error', async () => {
    postMock.mockRejectedValue(httpError(500))
    await expect(createStreamVideo({ ...creds, title: 'Clip' })).rejects.toThrow('Bunny Stream: Server error')
  })

  it('falls back to the generic message for other HTTPError statuses', async () => {
    postMock.mockRejectedValue(httpError(404))
    await expect(createStreamVideo({ ...creds, title: 'Clip' })).rejects.toThrow('Unable to create video: Clip')
  })

  it('falls back to the generic message for an unreadable response body', async () => {
    postMock.mockReturnValue({ json: () => Promise.reject(new Error('boom')) })
    await expect(createStreamVideo({ ...creds, title: 'Clip' })).rejects.toThrow('Unable to create video: Clip')
  })
})

describe('deleteStreamVideo', () => {
  it('sends a DELETE to the video URL and accepts a 404 through throwHttpErrors', async () => {
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

  it('falls back to the generic message for other HTTPError statuses', async () => {
    deleteMock.mockRejectedValue(httpError(400))
    await expect(deleteStreamVideo({ ...creds, videoId: 'vid-1' })).rejects.toThrow('Unable to delete video: vid-1')
  })
})

describe('uploadStreamVideo', () => {
  it('sends a PUT with the buffer and the default Stream upload timeout', async () => {
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

  it('falls back to the generic message for other HTTPError statuses', async () => {
    putMock.mockRejectedValue(httpError(403))
    await expect(uploadStreamVideo({ ...creds, buffer: Buffer.from('x'), videoId: 'vid-1' })).rejects.toThrow(
      'Unable to upload video: vid-1',
    )
  })
})

describe('listStreamVideos', () => {
  it('sends a GET with the default page and itemsPerPage searchParams', async () => {
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

  it('falls back to the generic message for other HTTPError statuses', async () => {
    getMock.mockRejectedValue(httpError(404))
    await expect(listStreamVideos({ ...creds })).rejects.toThrow('Unable to list videos')
  })
})

describe('getStreamVideoResolutions', () => {
  it('sends a GET to the resolutions URL and returns the parsed JSON', async () => {
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

  it('falls back to the generic message for other HTTPError statuses', async () => {
    getMock.mockRejectedValue(httpError(400))
    await expect(getStreamVideoResolutions({ ...creds, videoId: 'vid-1' })).rejects.toThrow(
      'Unable to get video resolutions: vid-1',
    )
  })
})

describe('getReadyResolutions', () => {
  const logger = { error: vi.fn() }
  const mp4 = (resolutions: string[]) =>
    jsonResponse({ data: { mp4Resolutions: resolutions.map((resolution) => ({ resolution })) }, success: true })
  const args = (overrides: Record<string, unknown> = {}) =>
    ({ ...creds, encoded: true, logger, mp4Fallback: true, videoId: 'vid-1', ...overrides }) as never

  beforeEach(() => {
    logger.error.mockReset()
  })

  it('fetches the MP4 resolutions of an encoded video', async () => {
    getMock.mockResolvedValue(mp4(['360p', '720p']))
    expect(await getReadyResolutions(args())).toEqual({ available: ['360p', '720p'], highest: '720p' })
  })

  it.each([
    ['the video is not fully encoded', { encoded: false }],
    ['mp4Fallback is off', { mp4Fallback: false }],
    ['resolutions are already stored', { resolutions: { available: ['480p'], highest: '480p' } }],
  ])('keeps the given resolutions without a request when %s', async (_label, overrides) => {
    expect(await getReadyResolutions(args(overrides))).toEqual((overrides as { resolutions?: unknown }).resolutions)
    expect(getMock).not.toHaveBeenCalled()
  })

  it('logs and keeps the given resolutions when the request fails', async () => {
    getMock.mockRejectedValue(httpError(500))
    expect(await getReadyResolutions(args({ resolutions: { available: [] } }))).toEqual({ available: [] })
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ msg: '[bunny:stream] failed to fetch resolutions', videoId: 'vid-1' }),
    )
  })

  it('rethrows a rate limit error after logging it', async () => {
    getMock.mockRejectedValue(httpError(429))
    await expect(getReadyResolutions(args())).rejects.toThrow('Unable to get video resolutions: vid-1')
    expect(logger.error).toHaveBeenCalledOnce()
  })

  it('returns the state with the resolutions of a ready video', async () => {
    getMock.mockResolvedValue(mp4(['1080p']))
    expect(
      await getStreamSaveState({
        ...creds,
        logger: logger as never,
        mp4Fallback: true,
        video: { availableResolutions: null, guid: 'vid-1', status: BunnyStreamVideoStatus.Finished },
      }),
    ).toEqual({ resolutions: { available: ['1080p'], highest: '1080p' }, status: 'ready' })
  })

  it('returns the state alone for a video that is still encoding', async () => {
    expect(
      await getStreamSaveState({
        ...creds,
        logger: logger as never,
        mp4Fallback: true,
        video: { availableResolutions: null, guid: 'vid-1', status: BunnyStreamVideoStatus.Processing },
      }),
    ).toEqual({ resolutions: null, status: 'processing' })
    expect(getMock).not.toHaveBeenCalled()
  })

  it('keeps a video that has its first resolution but is still transcoding processing', async () => {
    expect(
      await getStreamSaveState({
        ...creds,
        logger: logger as never,
        mp4Fallback: true,
        video: { availableResolutions: '360p', guid: 'vid-1', status: BunnyStreamVideoStatus.Transcoding },
      }),
    ).toEqual({ resolutions: null, status: 'processing' })
    expect(getMock).not.toHaveBeenCalled()
  })

  it('leaves the resolutions out when mp4Fallback is off', async () => {
    expect(
      await getStreamSaveState({
        ...creds,
        logger: logger as never,
        mp4Fallback: false,
        video: { availableResolutions: null, guid: 'vid-1', status: BunnyStreamVideoStatus.Finished },
      }),
    ).toEqual({ resolutions: undefined, status: 'ready' })
    expect(getMock).not.toHaveBeenCalled()
  })

  it('keeps an encoded video processing when Bunny rate limits the resolutions request', async () => {
    getMock.mockRejectedValue(httpError(429))
    expect(
      await getStreamSaveState({
        ...creds,
        logger: logger as never,
        mp4Fallback: true,
        video: { availableResolutions: null, guid: 'vid-1', status: BunnyStreamVideoStatus.JitPlaylistsCreated },
      }),
    ).toEqual({ resolutions: null, status: 'processing' })
  })

  it('keeps an encoded video processing while Bunny has no MP4 resolutions yet', async () => {
    getMock.mockResolvedValue(mp4([]))
    expect(
      await getStreamSaveState({
        ...creds,
        logger: logger as never,
        mp4Fallback: true,
        video: { availableResolutions: '720p', guid: 'vid-1', status: BunnyStreamVideoStatus.Finished },
      }),
    ).toEqual({ resolutions: null, status: 'processing' })
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

describe('status predicates', () => {
  it.each([
    [BunnyStreamVideoStatus.Created, { canUpload: true, error: false, processed: false }],
    [BunnyStreamVideoStatus.Uploaded, { canUpload: false, error: false, processed: true }],
    [BunnyStreamVideoStatus.Processing, { canUpload: false, error: false, processed: true }],
    [BunnyStreamVideoStatus.Transcoding, { canUpload: false, error: false, processed: true }],
    [BunnyStreamVideoStatus.Finished, { canUpload: false, error: false, processed: true }],
    [BunnyStreamVideoStatus.Error, { canUpload: false, error: true, processed: false }],
    [BunnyStreamVideoStatus.UploadFailed, { canUpload: false, error: true, processed: false }],
    [BunnyStreamVideoStatus.JitSegmenting, { canUpload: false, error: false, processed: true }],
    [BunnyStreamVideoStatus.JitPlaylistsCreated, { canUpload: false, error: false, processed: true }],
  ])('classifies status %s', (status, expected) => {
    expect({
      canUpload: canUploadToVideo(status),
      error: isVideoInErrorState(status),
      processed: isVideoProcessed(status),
    }).toEqual(expected)
  })
})

describe('getStreamVideoState', () => {
  it.each([
    [BunnyStreamVideoStatus.Created, 'processing'],
    [BunnyStreamVideoStatus.Uploaded, 'processing'],
    [BunnyStreamVideoStatus.Processing, 'processing'],
    [BunnyStreamVideoStatus.Transcoding, 'processing'],
    [BunnyStreamVideoStatus.Finished, 'ready'],
    [BunnyStreamVideoStatus.JitSegmenting, 'processing'],
    [BunnyStreamVideoStatus.JitPlaylistsCreated, 'ready'],
    [BunnyStreamVideoStatus.Error, 'failed'],
    [BunnyStreamVideoStatus.UploadFailed, 'failed'],
  ])('maps status %s to %s', (status, expected) => {
    expect(getStreamVideoState({ status })).toBe(expected)
  })
})

describe('getWebhookVideoState', () => {
  it.each([
    [0, 'Queued', 'processing'],
    [1, 'Processing', 'processing'],
    [2, 'Encoding', 'processing'],
    [3, 'Finished', 'ready'],
    [4, 'Resolution finished', 'processing'],
    [5, 'Failed', 'failed'],
    [6, 'PresignedUploadStarted', 'processing'],
    [7, 'PresignedUploadFinished', 'processing'],
    [8, 'PresignedUploadFailed', 'failed'],
    [9, 'CaptionsGenerated', undefined],
    [10, 'TitleOrDescriptionGenerated', undefined],
    [42, 'an unknown code', undefined],
  ])('maps webhook status %s (%s) to %s', (status, _event, expected) => {
    expect(getWebhookVideoState(status)).toBe(expected)
  })
})
