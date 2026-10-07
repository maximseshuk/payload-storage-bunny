import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getStreamStatus,
  getStreamStatusUrl,
  markPlayerReady,
  refreshStreamStatus,
  registerPlayer,
  subscribeStreamStatus,
} from '@/client/StreamStatus/streamStatusStore.js'
import { createNormalizedOptions } from '@/server/payload/options/normalizer.js'
import { getStreamEndpoints } from '@/server/payload/stream/endpoints.js'

import { stubStatusPolling } from '../../helpers/unit/statusPolling.js'

vi.mock('@payloadcms/ui', () => ({ useConfig: vi.fn() }))

const KEY = 'media:1:vid-1'
const URL = '/api/storage-bunny/stream/status/media/1'

const respond = (body: Record<string, unknown>) => ({ json: async () => body, ok: true })

describe('stream status store', () => {
  let fetchMock: ReturnType<typeof stubStatusPolling>['fetchMock']
  const stops: (() => void)[] = []

  const subscribe = (initialStatus: null | 'failed' | 'processing' | 'ready' = 'processing', listener = vi.fn()) => {
    const stop = subscribeStreamStatus(KEY, URL, initialStatus, listener)
    stops.push(stop)
    return stop
  }

  beforeEach(() => {
    fetchMock = stubStatusPolling(async () => respond({ state: 'processing' })).fetchMock
  })

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop())
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('runs one watcher per key for two subscribers and notifies both', async () => {
    const first = vi.fn()
    const second = vi.fn()
    fetchMock.mockResolvedValueOnce(respond({ state: 'ready' }))
    subscribe('processing', first)
    subscribe('processing', second)
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(URL, expect.objectContaining({ credentials: 'include' }))
    expect(first).toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
    expect(getStreamStatus(KEY)).toMatchObject({ checking: false, error: false, state: 'ready' })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops polling only when the last subscriber leaves', async () => {
    const stopFirst = subscribe()
    const stopSecond = subscribe()
    await vi.advanceTimersByTimeAsync(0)
    stopFirst()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    stopSecond()
    expect(getStreamStatus(KEY)).toBeUndefined()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not poll a stored ready or failed state', async () => {
    subscribe('ready')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getStreamStatus(KEY)?.state).toBe('ready')
  })

  it('runs one check at once on refresh and resets the backoff', async () => {
    subscribe()
    await vi.advanceTimersByTimeAsync(5000 + 10_000)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    refreshStreamStatus(KEY)
    expect(getStreamStatus(KEY)?.checking).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(getStreamStatus(KEY)?.checking).toBe(false)

    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('marks a finished refresh as checked until the next refresh', async () => {
    subscribe()
    await vi.advanceTimersByTimeAsync(0)
    expect(getStreamStatus(KEY)?.checked).toBeUndefined()

    refreshStreamStatus(KEY)
    expect(getStreamStatus(KEY)?.checked).toBe(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(getStreamStatus(KEY)).toMatchObject({ checked: true, checking: false, state: 'processing' })

    fetchMock.mockReturnValueOnce(new Promise(() => {}))
    refreshStreamStatus(KEY)
    expect(getStreamStatus(KEY)).toMatchObject({ checked: false, checking: true })
  })

  it('ignores a refresh while a check runs', async () => {
    subscribe('ready')
    fetchMock.mockReturnValue(new Promise(() => {}))
    refreshStreamStatus(KEY)
    refreshStreamStatus(KEY)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a failed refresh at once without marking it as checked and clears it after the next good check', async () => {
    subscribe()
    await vi.advanceTimersByTimeAsync(0)
    fetchMock.mockRejectedValueOnce(new Error('network'))
    refreshStreamStatus(KEY)
    await vi.advanceTimersByTimeAsync(0)
    expect(getStreamStatus(KEY)).toMatchObject({ checked: false, checking: false, error: true, state: 'processing' })

    await vi.advanceTimersByTimeAsync(5000)
    expect(getStreamStatus(KEY)).toMatchObject({ error: false, state: 'processing' })
  })

  describe('player', () => {
    const becomeReady = async () => {
      fetchMock.mockResolvedValueOnce(respond({ state: 'ready' }))
      subscribe()
      const unregister = registerPlayer(KEY)
      await vi.advanceTimersByTimeAsync(0)
      return unregister
    }

    it('keeps a ready state pending until the registered player is ready', async () => {
      await becomeReady()
      expect(getStreamStatus(KEY)).toMatchObject({ playerPending: true, state: 'ready' })

      markPlayerReady(KEY)
      expect(getStreamStatus(KEY)).toMatchObject({ playerPending: false, state: 'ready' })
    })

    it('releases the ready state when the player unmounts', async () => {
      const unregister = await becomeReady()
      unregister()
      expect(getStreamStatus(KEY)?.playerPending).toBe(false)
    })

    it('releases the ready state when the player gives up after all its attempts', async () => {
      await becomeReady()
      await vi.advanceTimersByTimeAsync(59_999)
      expect(getStreamStatus(KEY)?.playerPending).toBe(true)
      await vi.advanceTimersByTimeAsync(1)
      expect(getStreamStatus(KEY)?.playerPending).toBe(false)
    })

    it('does not hold a ready state for a video without a stored status', async () => {
      fetchMock.mockResolvedValueOnce(respond({ state: 'ready' }))
      subscribe(null)
      registerPlayer(KEY)
      await vi.advanceTimersByTimeAsync(0)
      expect(getStreamStatus(KEY)).toMatchObject({ state: 'ready' })
      expect(getStreamStatus(KEY)?.playerPending).toBeUndefined()
    })

    it('does not hold a state that is ready before the player mounts', () => {
      subscribe('ready')
      registerPlayer(KEY)
      expect(getStreamStatus(KEY)?.playerPending).toBeUndefined()
    })
  })

  it('stops polling on a 404 answer and starts again on refresh', async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({}), ok: false, status: 404 })
    subscribe()
    await vi.advanceTimersByTimeAsync(0)
    expect(getStreamStatus(KEY)).toMatchObject({ error: true, state: 'error' })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    refreshStreamStatus(KEY)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getStreamStatus(KEY)).toMatchObject({ checking: false, error: false, state: 'processing' })
  })

  it('builds the status URL of the server endpoint with encoded path parameters', () => {
    const options = createNormalizedOptions({
      collections: { media: true },
      stream: { apiKey: 'stream-key', hostname: 'stream.bunny.net', libraryId: 12345 },
    })
    const path = getStreamEndpoints(options)
      .map((endpoint) => endpoint.path)
      .find((endpointPath) => endpointPath.startsWith('/storage-bunny/stream/status/'))

    expect(path).toBe('/storage-bunny/stream/status/:collection/:id/:videoId')
    expect(getStreamStatusUrl('/api', '', 'my media', 'a/b', 'v 1')).toBe(
      `/api${path?.replace(':collection', 'my%20media').replace(':id', 'a%2Fb').replace(':videoId', 'v%201')}`,
    )
    expect(getStreamStatusUrl('/api', 'https://cms.example.com', 'media', 7, 'video-1')).toBe(
      'https://cms.example.com/api/storage-bunny/stream/status/media/7/video-1',
    )
  })

  it('does not report a single failed background check', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'))
    subscribe()
    await vi.advanceTimersByTimeAsync(0)
    expect(getStreamStatus(KEY)).toMatchObject({ error: false, state: 'processing' })
  })
})
