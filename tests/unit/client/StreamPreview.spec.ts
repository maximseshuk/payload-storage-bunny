import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StreamPreview } from '@/client/StreamPreview/StreamPreview.js'
import { subscribeStreamStatus } from '@/client/StreamStatus/streamStatusStore.js'

import { stubStatusPolling } from '../../helpers/unit/statusPolling.js'

vi.mock('@payloadcms/ui', async () => {
  const { createElement: h } = await import('react')
  const { en } = await import('@/shared/translations/locales/en.js')
  const messages: Record<string, string> = en['@seshuk/payload-storage-bunny']
  return {
    ErrorIcon: () => h('svg', { 'data-icon': 'error' }),
    Spinner: () => h('span', { 'data-spinner': '' }),
    useConfig: () => ({ config: { routes: { api: '/api' }, serverURL: '' } }),
    useTranslation: () => ({ t: (key: string) => messages[key.split(':')[1]!] }),
  }
})

const SRC = 'https://iframe.mediadelivery.net/embed/42/vid-1'

const render = (props: Partial<Parameters<typeof StreamPreview>[0]>) =>
  renderToStaticMarkup(createElement(StreamPreview, { src: SRC, ...props }))

describe('StreamPreview', () => {
  it('shows the given status without a document ID', () => {
    expect(render({ collectionSlug: 'media', status: 'processing', videoId: 'vid-1' })).toBe(
      '<output class="storage-bunny-stream-preview"><span data-spinner=""></span>Processing video…</output>',
    )
  })

  const player = (overlay: string) =>
    `<div class="storage-bunny-stream-preview__frame"><iframe class="storage-bunny-stream-preview__player" inert="" loading="eager" title="clip.mp4"></iframe><output class="storage-bunny-stream-preview"><span data-spinner=""></span>${overlay}</output></div>`
  let stop = () => {}

  afterEach(() => {
    stop()
    stop = () => {}
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps a stored ready player inert, eager and without a source under a placeholder until it mounts', () => {
    expect(render({ id: 1, collectionSlug: 'media', status: 'ready', title: 'clip.mp4', videoId: 'vid-1' })).toBe(
      player('<span class="sr-only">Loading video</span>'),
    )
  })

  const watch = async (response: Record<string, unknown>, wait = 0, status: null | 'processing' = 'processing') => {
    stubStatusPolling(async () => response)
    stop = subscribeStreamStatus('media:1:vid-1', '/api/status', status, () => {})
    await vi.advanceTimersByTimeAsync(wait)
    return render({ id: 1, collectionSlug: 'media', status, title: 'clip.mp4', videoId: 'vid-1' })
  }

  it('announces the processing text over a player that just became ready', async () => {
    expect(await watch({ json: async () => ({ state: 'ready' }), ok: true })).toBe(player('Processing video…'))
  })

  it('shows the loading placeholder over a ready player for a video without a stored status', async () => {
    expect(await watch({ json: async () => ({ state: 'ready' }), ok: true }, 0, null)).toBe(
      player('<span class="sr-only">Loading video</span>'),
    )
  })

  it('shows an alert when processing failed', async () => {
    expect(await watch({ json: async () => ({ state: 'failed' }), ok: true })).toBe(
      '<div class="storage-bunny-stream-preview storage-bunny-stream-preview--danger" role="alert"><svg data-icon="error"></svg>Video processing failed</div>',
    )
  })

  it('asks to check again later when the video still processes after 30 minutes', async () => {
    expect(await watch({ json: async () => ({ state: 'processing' }), ok: true }, 31 * 60 * 1000)).toBe(
      '<output class="storage-bunny-stream-preview">The video is still processing. Check the status again later</output>',
    )
  })

  it('shows the status error under a spinner when the check fails', async () => {
    expect(await watch({ json: async () => ({}), ok: false, status: 404 })).toBe(
      '<output class="storage-bunny-stream-preview"><span data-spinner=""></span>Could not check the video status</output>',
    )
  })

  it('shows the plain player without a collection', () => {
    expect(render({ title: 'clip.mp4' })).toBe(
      `<iframe class="storage-bunny-stream-preview__player" loading="lazy" src="${SRC}" title="clip.mp4"></iframe>`,
    )
  })

  it('names the plain player without a title', () => {
    expect(render({})).toBe(
      `<iframe class="storage-bunny-stream-preview__player" loading="lazy" src="${SRC}" title="Bunny Stream video"></iframe>`,
    )
  })
})
