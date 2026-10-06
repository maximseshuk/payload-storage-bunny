import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { watchPlayerReady } from '@/client/StreamPreview/watchPlayerReady.js'

const READY = JSON.stringify({ context: 'player.js', event: 'ready', value: {}, version: '0.0.11' })

describe('watchPlayerReady', () => {
  let win: EventTarget
  const playerWindow = {}
  const frame = { contentWindow: playerWindow } as HTMLIFrameElement

  const post = (data: unknown, source: unknown = playerWindow, origin = 'https://iframe.mediadelivery.net') =>
    win.dispatchEvent(Object.assign(new Event('message'), { data, origin, source }))

  beforeEach(() => {
    vi.useFakeTimers()
    win = new EventTarget()
    vi.stubGlobal('window', win)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reports ready when the player of this frame posts its ready event', () => {
    const onReady = vi.fn()
    const onTimeout = vi.fn()
    watchPlayerReady(frame, onReady, onTimeout)

    post(READY)
    expect(onReady).toHaveBeenCalledTimes(1)

    post(READY)
    vi.advanceTimersByTime(60_000)
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('accepts the ready event as an object', () => {
    const onReady = vi.fn()
    watchPlayerReady(frame, onReady, vi.fn())
    post({ context: 'player.js', event: 'ready' })
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('ignores other frames, other events and other messages', () => {
    const onReady = vi.fn()
    watchPlayerReady(frame, onReady, vi.fn())

    post(READY, {})
    post(JSON.stringify({ context: 'player.js', event: 'play' }))
    post('not json')
    post(null)
    expect(onReady).not.toHaveBeenCalled()
  })

  it('ignores a ready event from another origin', () => {
    const onReady = vi.fn()
    watchPlayerReady(frame, onReady, vi.fn())

    post(READY, playerWindow, 'https://evil.example')
    post(READY, playerWindow, 'http://iframe.mediadelivery.net')
    expect(onReady).not.toHaveBeenCalled()
  })

  it('times out when the player stays empty, for example after a missing playlist', () => {
    const onReady = vi.fn()
    const onTimeout = vi.fn()
    watchPlayerReady(frame, onReady, onTimeout)

    vi.advanceTimersByTime(14_999)
    expect(onTimeout).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onTimeout).toHaveBeenCalledTimes(1)

    post(READY)
    expect(onReady).not.toHaveBeenCalled()
  })

  it('stops listening when stopped', () => {
    const onReady = vi.fn()
    const onTimeout = vi.fn()
    const stop = watchPlayerReady(frame, onReady, onTimeout)
    stop()

    post(READY)
    vi.advanceTimersByTime(60_000)
    expect(onReady).not.toHaveBeenCalled()
    expect(onTimeout).not.toHaveBeenCalled()
  })
})
