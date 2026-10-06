import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StreamPreview } from '@/client/StreamPreview/StreamPreview.js'
import { PLAYER_ATTEMPTS } from '@/client/StreamPreview/watchPlayerReady.js'
import { getStreamStatus, subscribeStreamStatus } from '@/client/StreamStatus/streamStatusStore.js'

const player = vi.hoisted(() => ({
  cleanups: [] as (() => void)[],
  client: false,
  cursor: 0,
  frame: new EventTarget(),
  onReady: () => {},
  onTimeout: () => {},
  states: [] as unknown[],
}))

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  return {
    ...react,
    useEffect: (effect: () => (() => void) | void) => {
      const cleanup = effect()
      if (cleanup) {
        player.cleanups.push(cleanup)
      }
    },
    useRef: () => ({ current: player.frame }),
    useSyncExternalStore: <T>(_subscribe: unknown, getSnapshot: () => T, getServerSnapshot?: () => T) =>
      (player.client ? getSnapshot : (getServerSnapshot ?? getSnapshot))(),
    useState: <T>(initial: T) => {
      const index = player.cursor++
      if (!(index in player.states)) {
        player.states[index] = initial
      }
      return [player.states[index], (value: T) => void (player.states[index] = value)]
    },
  }
})

vi.mock('@/client/StreamPreview/watchPlayerReady.js', () => ({
  PLAYER_ATTEMPTS: 4,
  READY_TIMEOUT: 15000,
  watchPlayerReady: (_frame: unknown, onReady: () => void, onTimeout: () => void) => {
    player.onReady = onReady
    player.onTimeout = onTimeout
    return () => {}
  },
}))

vi.mock('@payloadcms/ui', async () => {
  const { createElement: h } = await import('react')
  return {
    ErrorIcon: () => h('svg'),
    Spinner: () => h('span'),
    useConfig: () => ({ config: { routes: { api: '/api' }, serverURL: '' } }),
    useTranslation: () => ({ t: (key: string) => key }),
  }
})

const KEY = 'media:1:vid-1'
const SRC = 'https://iframe.mediadelivery.net/embed/42/vid-1'

describe('StreamPreview player', () => {
  let stop = () => {}

  afterEach(() => {
    stop()
    player.client = false
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  let render = () => ''

  const mountPlayer = async (status: 'processing' | 'ready') => {
    player.cleanups = []
    player.states = []
    vi.useFakeTimers()
    vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ json: async () => ({ state: 'ready' }), ok: true })),
    )
    stop = subscribeStreamStatus(KEY, '/api/status', 'processing', () => {})
    const props = {
      id: 1,
      collectionSlug: 'media',
      src: SRC,
      status,
      videoId: 'vid-1',
    }

    render = () => {
      player.cursor = 0
      return renderToStaticMarkup(createElement(StreamPreview, props))
    }

    render()
    await vi.advanceTimersByTimeAsync(0)
    expect(getStreamStatus(KEY)).toMatchObject({ playerPending: true, state: 'ready' })

    player.frame = new EventTarget()
    render()
  }

  it('sets the embed URL on the frame only in a client render', async () => {
    await mountPlayer('ready')
    expect(render()).not.toContain('src=')

    player.client = true
    expect(render()).toContain(`src="${SRC}"`)
  })

  it('holds the ready state for the card until the player posts ready', async () => {
    await mountPlayer('processing')
    player.onReady()
    expect(getStreamStatus(KEY)?.playerPending).toBe(false)
  })

  it('keeps a processing player hidden after the first timeout', async () => {
    await mountPlayer('processing')
    player.frame.dispatchEvent(new Event('load'))
    player.onTimeout()
    expect(getStreamStatus(KEY)?.playerPending).toBe(true)
  })

  it('shows a processing player after all its attempts time out', async () => {
    await mountPlayer('processing')
    for (let attempt = 1; attempt < PLAYER_ATTEMPTS; attempt += 1) {
      player.onTimeout()
      expect(getStreamStatus(KEY)?.playerPending).toBe(true)
      render()
    }

    player.onTimeout()
    expect(getStreamStatus(KEY)?.playerPending).toBe(false)
  })

  it('shows a stored ready player after the first timeout', async () => {
    await mountPlayer('ready')
    player.onTimeout()
    expect(getStreamStatus(KEY)?.playerPending).toBe(false)
  })

  it('shows a stored ready player when the frame loads', async () => {
    await mountPlayer('ready')
    player.frame.dispatchEvent(new Event('load'))
    expect(getStreamStatus(KEY)?.playerPending).toBe(false)
  })

  it('stops listening for the frame load on unmount', async () => {
    await mountPlayer('ready')
    player.cleanups.at(-1)?.()
    player.frame.dispatchEvent(new Event('load'))
    expect(getStreamStatus(KEY)?.playerPending).toBe(true)
  })
})
