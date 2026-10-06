import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { watchStreamStatus } from '@/client/StreamPreview/watchStreamStatus.js'

import { stubStatusPolling } from '../../helpers/unit/statusPolling.js'

const URL = '/api/storage-bunny/stream/status/media/1'

const respond = (state: string) => ({ json: async () => ({ state }), ok: true })

describe('watchStreamStatus', () => {
  let doc: ReturnType<typeof stubStatusPolling>['doc']
  let fetchMock: ReturnType<typeof stubStatusPolling>['fetchMock']

  beforeEach(() => {
    ;({ doc, fetchMock } = stubStatusPolling(async () => respond('processing')))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('polls with a 5, 10, 20 and then 30 second backoff', async () => {
    const onState = vi.fn()
    const stop = watchStreamStatus(URL, onState)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(URL, expect.objectContaining({ credentials: 'include' }))

    for (const [delay, calls] of [
      [5000, 2],
      [10_000, 3],
      [20_000, 4],
      [30_000, 5],
      [30_000, 6],
    ]) {
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(fetchMock).toHaveBeenCalledTimes(calls - 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(fetchMock).toHaveBeenCalledTimes(calls)
    }
    expect(onState).toHaveBeenCalledWith('processing')
    stop()
  })

  it('stops polling once the video is ready', async () => {
    fetchMock.mockResolvedValueOnce(respond('processing')).mockResolvedValueOnce(respond('ready'))
    const onState = vi.fn()
    watchStreamStatus(URL, onState)
    await vi.advanceTimersByTimeAsync(5000)
    expect(onState).toHaveBeenLastCalledWith('ready')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('aborts the request and the timer on unmount', async () => {
    let signal: AbortSignal | undefined
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          signal = init.signal ?? undefined
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const onState = vi.fn()
    const stop = watchStreamStatus(URL, onState)
    await vi.advanceTimersByTimeAsync(0)
    stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(signal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onState).not.toHaveBeenCalled()
  })

  it('counts a request that hangs for 15 seconds as a failed check', async () => {
    let signal: AbortSignal | undefined
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          signal = init.signal ?? undefined
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const onCheck = vi.fn()
    watchStreamStatus(URL, vi.fn(), onCheck)
    await vi.advanceTimersByTimeAsync(14_999)
    expect(onCheck).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(signal?.aborted).toBe(true)
    expect(onCheck).toHaveBeenCalledExactlyOnceWith()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('clears a pending timer on unmount', async () => {
    const stop = watchStreamStatus(URL, vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('pauses while the tab is hidden and resumes when it becomes visible', async () => {
    watchStreamStatus(URL, vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    doc.hidden = true
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    doc.hidden = false
    doc.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('waits for the tab to become visible before the first request', async () => {
    doc.hidden = true
    watchStreamStatus(URL, vi.fn())
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).not.toHaveBeenCalled()

    doc.hidden = false
    doc.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([500, 408, 429])(
    'reports an error after three failed %i answers in a row and keeps polling with backoff',
    async (status) => {
      fetchMock.mockResolvedValue({ json: async () => ({}), ok: false, status })
      const onState = vi.fn()
      watchStreamStatus(URL, onState)
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(5000)
      expect(onState).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(onState).toHaveBeenCalledExactlyOnceWith('error')
      await vi.advanceTimersByTimeAsync(20_000)
      expect(fetchMock).toHaveBeenCalledTimes(4)
      await vi.advanceTimersByTimeAsync(30_000)
      expect(fetchMock).toHaveBeenCalledTimes(5)
      expect(onState).not.toHaveBeenCalledWith('ready')
    },
  )

  it.each([400, 401, 403, 404])('reports an error at once and stops polling on a %i answer', async (status) => {
    fetchMock.mockResolvedValue({ json: async () => ({}), ok: false, status })
    const onState = vi.fn()
    const onCheck = vi.fn()
    watchStreamStatus(URL, onState, onCheck)
    await vi.advanceTimersByTimeAsync(0)
    expect(onCheck).toHaveBeenCalledExactlyOnceWith()
    expect(onState).toHaveBeenCalledExactlyOnceWith('error')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('counts an answer with an unknown state as a failed check', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ state: 'queued' }), ok: true })
    const onState = vi.fn()
    const onCheck = vi.fn()
    watchStreamStatus(URL, onState, onCheck)
    await vi.advanceTimersByTimeAsync(0)
    expect(onCheck).toHaveBeenCalledExactlyOnceWith()
    await vi.advanceTimersByTimeAsync(5000 + 10_000)
    expect(onState).toHaveBeenCalledExactlyOnceWith('error')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('reports the real state when the status check recovers after errors', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(respond('ready'))
    const onState = vi.fn()
    watchStreamStatus(URL, onState)
    await vi.advanceTimersByTimeAsync(5000 + 10_000)
    expect(onState).toHaveBeenLastCalledWith('error')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(onState).toHaveBeenLastCalledWith('ready')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('resets the error count after a successful request', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(respond('processing'))
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
    const onState = vi.fn()
    watchStreamStatus(URL, onState)
    await vi.advanceTimersByTimeAsync(5000 + 10_000 + 20_000 + 30_000)
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(onState).toHaveBeenCalledExactlyOnceWith('processing')
  })

  it.each([
    ['of processing answers', () => {}],
    ['of failed requests', () => fetchMock.mockRejectedValue(new Error('network'))],
  ])('stops after 30 minutes %s and reports the video as still processing', async (_label, setup) => {
    setup()
    const onState = vi.fn()
    watchStreamStatus(URL, onState)
    await vi.advanceTimersByTimeAsync(31 * 60 * 1000)
    expect(onState).toHaveBeenLastCalledWith('stale')
    expect(onState).not.toHaveBeenCalledWith('ready')
    const calls = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    expect(fetchMock).toHaveBeenCalledTimes(calls)
  })
})
