import nodeConsole from 'node:console'

import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { StreamPreview } from '@/client/StreamPreview/StreamPreview.js'
import { PLAYER_ATTEMPTS } from '@/client/StreamPreview/watchPlayerReady.js'
import { getStreamStatus, markPlayerReady, subscribeStreamStatus } from '@/client/StreamStatus/streamStatusStore.js'

const player = vi.hoisted(() => ({ onReady: () => {}, onTimeout: () => {} }))

vi.mock('@/client/StreamPreview/watchPlayerReady.js', () => ({
  PLAYER_ATTEMPTS: 4,
  READY_TIMEOUT: 15000,
  watchPlayerReady: (_frame: unknown, onReady: () => void, onTimeout: () => void) => {
    player.onReady = onReady
    player.onTimeout = onTimeout
    return () => {}
  },
}))

vi.mock('@/client/StreamStatus/streamStatusStore.js', async (importOriginal) => {
  const store = await importOriginal<typeof import('@/client/StreamStatus/streamStatusStore.js')>()
  return { ...store, markPlayerReady: vi.fn(store.markPlayerReady) }
})

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

  beforeEach(() => {
    const logError = nodeConsole.error.bind(nodeConsole)
    vi.spyOn(nodeConsole, 'error').mockImplementation((error: unknown, ...rest: unknown[]) => {
      if (!String(error).includes('Iframe page loading is disabled')) {
        logError(error, ...rest)
      }
    })
  })

  afterEach(() => {
    stop()
    vi.unstubAllGlobals()
    vi.mocked(nodeConsole.error).mockRestore()
  })

  const preview = (status: 'processing' | 'ready') =>
    createElement(StreamPreview, { id: 1, collectionSlug: 'media', src: SRC, status, videoId: 'vid-1' })

  const mountPlayer = async (status: 'processing' | 'ready') => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ json: async () => ({ state: 'ready' }), ok: true })),
    )
    stop = subscribeStreamStatus(KEY, '/api/status', 'processing', () => {})
    const view = render(preview(status))
    await waitFor(() => expect(view.container.querySelector('iframe')).not.toBeNull())
    expect(getStreamStatus(KEY)).toMatchObject({ playerPending: true, state: 'ready' })
    return { frame: () => view.container.querySelector('iframe')!, unmount: view.unmount }
  }

  it('sets the embed URL on the frame only in a client render', async () => {
    const { frame } = await mountPlayer('ready')

    expect(renderToStaticMarkup(preview('ready'))).not.toContain('src=')
    expect(frame().getAttribute('src')).toBe(SRC)
  })

  it('holds the ready state for the card until the player posts ready', async () => {
    const { frame } = await mountPlayer('processing')
    expect(frame().hasAttribute('inert')).toBe(true)

    act(() => player.onReady())

    expect(getStreamStatus(KEY)?.playerPending).toBe(false)
    expect(frame().hasAttribute('inert')).toBe(false)
  })

  it('keeps a processing player hidden after the first timeout', async () => {
    const { frame } = await mountPlayer('processing')
    fireEvent.load(frame())
    act(() => player.onTimeout())

    expect(getStreamStatus(KEY)?.playerPending).toBe(true)
  })

  it('shows a processing player after all its attempts time out', async () => {
    await mountPlayer('processing')
    for (let attempt = 1; attempt < PLAYER_ATTEMPTS; attempt += 1) {
      act(() => player.onTimeout())
      expect(getStreamStatus(KEY)?.playerPending).toBe(true)
    }

    act(() => player.onTimeout())
    expect(getStreamStatus(KEY)?.playerPending).toBe(false)
  })

  it.each([
    ['after the first timeout', () => act(() => player.onTimeout())],
    ['when the frame loads', (frame: HTMLIFrameElement) => fireEvent.load(frame)],
  ])('shows a stored ready player %s', async (_label, trigger) => {
    const { frame } = await mountPlayer('ready')
    trigger(frame())
    expect(getStreamStatus(KEY)?.playerPending).toBe(false)
  })

  it('stops listening for the frame load on unmount', async () => {
    const { frame, unmount } = await mountPlayer('ready')
    const unmounted = frame()
    unmount()
    vi.mocked(markPlayerReady).mockClear()

    fireEvent.load(unmounted)
    expect(markPlayerReady).not.toHaveBeenCalled()
  })
})
