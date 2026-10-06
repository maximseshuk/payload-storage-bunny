import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StreamStatusCell, StreamStatusField } from '@/client/StreamStatus/StreamStatus.js'
import {
  markPlayerReady,
  refreshStreamStatus,
  registerPlayer,
  subscribeStreamStatus,
} from '@/client/StreamStatus/streamStatusStore.js'

import { stubStatusPolling } from '../../helpers/unit/statusPolling.js'

const form = vi.hoisted(() => ({
  id: 1 as number | undefined,
  collectionSlug: 'media',
  data: {} as Record<string, unknown>,
  fields: {} as Record<string, { value: unknown }>,
}))

vi.mock('@payloadcms/ui', async () => {
  const { createElement: h } = await import('react')
  const { PLUGIN_KEY } = await import('@/shared/constants.js')
  const { en } = await import('@/shared/translations/locales/en.js')
  const messages: Record<string, string> = {
    ...en['@seshuk/payload-storage-bunny'],
    copied: 'Copied',
    status: 'Status',
  }
  return {
    CopyIcon: ({ size }: { size: number }) => h('svg', { 'data-icon': 'copy', 'data-size': size }),
    FieldLabel: ({ as = 'label', label, path }: { as?: string; label: string; path: string }) =>
      h(as, { className: 'field-label', ...(as === 'label' && { htmlFor: `field-${path}` }) }, label),
    NewTabIcon: ({ className, size }: { className?: string; size: number }) =>
      h('svg', { className, 'data-size': size }),
    RefreshIcon: ({ size }: { size: number }) => h('svg', { 'data-icon': 'refresh', 'data-size': size }),
    Tooltip: ({ children, show }: { children: string; show: boolean }) =>
      h('span', { 'data-show': String(show), role: 'tooltip' }, children),
    useConfig: () => ({
      config: { routes: { api: '/api' }, serverURL: '' },
      getEntityConfig: ({ collectionSlug }: { collectionSlug: string }) =>
        collectionSlug === 'media'
          ? { admin: { custom: { [PLUGIN_KEY]: { stream: { libraryId: 42, link: true } } } } }
          : { admin: { custom: { [PLUGIN_KEY]: { stream: { libraryId: 42 } } } } },
    }),
    useDocumentInfo: () => ({ id: form.id, collectionSlug: form.collectionSlug, data: form.data }),
    useFormFields: (selector: (state: [typeof form.fields]) => unknown) => selector([form.fields]),
    useTranslation: () => ({ t: (key: string) => messages[key.split(':')[1]!] }),
  }
})

const HREF = 'https://dash.bunny.net/stream/42/library/overview?vid=vid-1'
const TOOLTIP = 'Open in Bunny Stream dashboard'

const pillClass = (pillStyle: string) => `pill pill--style-${pillStyle} pill--size-small storage-bunny-stream-status`

const linkPill = (label: string, pillStyle: string) =>
  `<a aria-label="${label}, ${TOOLTIP} (opens in new tab)" class="${pillClass(pillStyle)} storage-bunny-stream-status--link" href="${HREF}" rel="noopener noreferrer" target="_blank"><span data-show="false" role="tooltip">${TOOLTIP}</span><span class="pill__label">${label}</span><svg class="storage-bunny-stream-status__icon" data-size="16"></svg></a>`

const plainPill = (label: string, pillStyle: string) =>
  `<span class="${pillClass(pillStyle)}"><span class="pill__label">${label}</span></span>`

const renderCell = (stream: Record<string, unknown> | undefined, collectionSlug = 'media') =>
  renderToStaticMarkup(createElement(StreamStatusCell, { collectionSlug, rowData: { bunnyData: { stream } } } as never))

describe('StreamStatusCell', () => {
  it.each([
    ['processing', 'Processing', 'warning'],
    ['ready', 'Ready', 'success'],
    ['failed', 'Failed', 'error'],
    [null, 'Unknown', 'light-gray'],
  ])('renders the %s state as one dashboard link with a tooltip inside a div', (status, label, pillStyle) => {
    expect(renderCell({ status, videoId: 'vid-1' })).toBe(`<div>${linkPill(label, pillStyle)}</div>`)
  })

  it('renders an Unknown pill link for an inherited object key', () => {
    expect(renderCell({ status: 'toString', videoId: 'vid-1' })).toBe(`<div>${linkPill('Unknown', 'light-gray')}</div>`)
  })

  it('renders a plain pill without a link, icon or tooltip when the link is off', () => {
    expect(renderCell({ status: 'ready', videoId: 'vid-1' }, 'clips')).toBe(
      `<div>${plainPill('Ready', 'success')}</div>`,
    )
    expect(renderCell({ videoId: 'vid-1' }, 'clips')).toBe(`<div>${plainPill('Unknown', 'light-gray')}</div>`)
  })

  it('renders nothing without a video', () => {
    expect(renderCell(undefined)).toBe('')
    expect(renderCell({ status: 'ready', videoId: '' })).toBe('')
  })
})

const VIDEO_ID = 'vid-1'

const COPY = `<button aria-label="Copy video ID" class="btn btn--style-ghost btn--size-medium btn--icon btn--icon-only btn--round btn--no-margin storage-bunny-stream-card__copy" type="button"><span data-show="false" role="tooltip">Copy video ID</span><svg data-icon="copy" data-size="16"></svg></button><span aria-live="polite" class="sr-only"></span>`

const FOOTER = `<div class="storage-bunny-stream-card__footer"><a aria-label="Open in Bunny dashboard (opens in new tab)" class="btn btn--style-ghost btn--size-medium btn--icon btn--icon-position-right btn--no-margin storage-bunny-stream-card__link" href="${HREF}" rel="noopener noreferrer" target="_blank"><span class="btn__content"><span class="btn__label">Open in Bunny dashboard</span><span class="btn__icon"><svg data-size="16"></svg></span></span></a></div>`

const CHECK_LABEL = 'Check status now'

const check = (checking = false) =>
  `<button ${checking ? 'aria-busy="true" aria-disabled="true" ' : ''}aria-label="${CHECK_LABEL}" class="btn btn--style-ghost btn--size-medium btn--icon btn--icon-only btn--round btn--no-margin${checking ? ' btn--disabled' : ''} storage-bunny-stream-card__check" type="button"><span data-show="false" role="tooltip">${CHECK_LABEL}</span><svg data-icon="refresh" data-size="16"></svg></button>`

const ERROR = '<span class="storage-bunny-stream-card__error">Could not check the video status</span>'

const STILL_PROCESSING = '<span class="sr-only">The video is still processing. Check the status again later</span>'

const card = (pill: string, { button = check(), error = '', footer = true, mp4 = '' } = {}) =>
  `<div class="field-type"><span class="field-label">Bunny Stream</span><div class="storage-bunny-stream-card"><dl class="storage-bunny-stream-card__rows"><dt>Status</dt><dd class="storage-bunny-stream-card__status"><span aria-live="polite" class="storage-bunny-stream-card__live" tabindex="-1">${pill}${error}</span>${button}</dd><dt>Video ID</dt><dd class="storage-bunny-stream-card__id"><code title="${VIDEO_ID}">${VIDEO_ID}</code>${COPY}</dd>${mp4 ? `<dt>MP4</dt><dd>${mp4}</dd>` : ''}</dl>${footer ? FOOTER : ''}</div></div>`

const renderField = (
  fields: Record<string, unknown>,
  collectionSlug = 'media',
  id: null | number = 1,
  stored: Record<string, unknown> = {},
) => {
  form.id = id ?? undefined
  form.collectionSlug = collectionSlug
  form.data = {
    bunnyData: {
      stream: {
        resolutions: fields['bunnyData.stream.resolutions'],
        status: fields.bunnyStream,
        videoId: fields['bunnyData.stream.videoId'],
        ...stored,
      },
    },
  }
  form.fields = Object.fromEntries(Object.entries(fields).map(([path, value]) => [path, { value }]))
  return renderToStaticMarkup(createElement(StreamStatusField, { path: 'bunnyStream' } as never))
}

describe('StreamStatusField', () => {
  it('renders the field label and a card with the status, the video ID and the dashboard link', () => {
    expect(renderField({ 'bunnyData.stream.videoId': VIDEO_ID, bunnyStream: 'processing' })).toBe(
      card(plainPill('Processing', 'warning')),
    )
  })

  it('lists the stored MP4 renditions', () => {
    expect(
      renderField({
        'bunnyData.stream.resolutions': { available: ['720p', '1080p'], highest: '1080p' },
        'bunnyData.stream.videoId': VIDEO_ID,
        bunnyStream: 'ready',
      }),
    ).toBe(card(plainPill('Ready', 'success'), { button: '', mp4: '720p, 1080p' }))
  })

  it.each([null, {}, { available: [] }])('hides the MP4 row when resolutions are %j', (resolutions) => {
    expect(
      renderField({
        'bunnyData.stream.resolutions': resolutions,
        'bunnyData.stream.videoId': VIDEO_ID,
        bunnyStream: 'failed',
      }),
    ).toBe(card(plainPill('Failed', 'error'), { button: '' }))
  })

  it('renders the Unknown pill when no state is stored', () => {
    expect(renderField({ 'bunnyData.stream.videoId': VIDEO_ID })).toBe(card(plainPill('Unknown', 'light-gray')))
  })

  it('hides the dashboard link when the link is off', () => {
    expect(renderField({ 'bunnyData.stream.videoId': VIDEO_ID, bunnyStream: 'ready' }, 'clips')).toBe(
      card(plainPill('Ready', 'success'), { button: '', footer: false }),
    )
  })

  it('renders nothing without a video', () => {
    expect(renderField({ bunnyStream: 'ready' })).toBe('')
  })

  it('renders nothing for a saved non-Stream file, because Payload keeps the old video ID in the form after a save', () => {
    expect(renderField({ 'bunnyData.stream.videoId': VIDEO_ID, bunnyStream: 'ready', mimeType: 'image/jpeg' })).toBe('')
  })

  it.each(['video/mp4', 'audio/mpeg', ''])('renders the card for a %j file', (mimeType) => {
    expect(renderField({ 'bunnyData.stream.videoId': VIDEO_ID, bunnyStream: 'ready', mimeType })).toBe(
      card(plainPill('Ready', 'success'), { button: '' }),
    )
  })

  it('shows a new video as Processing without the check button before the document is saved', () => {
    expect(renderField({ 'bunnyData.stream.videoId': VIDEO_ID }, 'media', null)).toBe(
      card(plainPill('Processing', 'warning'), { button: '' }),
    )
  })

  it('shows a replaced video as Processing without the old renditions until the document is saved', () => {
    expect(
      renderField(
        {
          'bunnyData.stream.resolutions': { available: ['720p'], highest: '720p' },
          'bunnyData.stream.videoId': VIDEO_ID,
          bunnyStream: 'ready',
        },
        'media',
        1,
        { videoId: 'vid-old' },
      ),
    ).toBe(card(plainPill('Processing', 'warning'), { button: '' }))
  })

  it('shows a saved replaced video as Processing without the old renditions before the form state is replaced', () => {
    expect(
      renderField(
        {
          'bunnyData.stream.resolutions': { available: ['720p'], highest: '720p' },
          'bunnyData.stream.videoId': VIDEO_ID,
          bunnyStream: 'ready',
        },
        'media',
        1,
        { resolutions: null, status: 'processing' },
      ),
    ).toBe(card(plainPill('Processing', 'warning')))
  })
})

describe('StreamStatusField live status', () => {
  const KEY = `media:1:${VIDEO_ID}`
  const ENDPOINT = '/api/storage-bunny/stream/status/media/1'
  const PROCESSING = { 'bunnyData.stream.videoId': VIDEO_ID, bunnyStream: 'processing' }
  let fetchMock: ReturnType<typeof stubStatusPolling>['fetchMock']
  let stop: () => void = () => {}

  const subscribe = (fetchImpl: () => unknown, status: 'processing' | 'ready' = 'processing') => {
    fetchMock = stubStatusPolling(fetchImpl).fetchMock
    stop = subscribeStreamStatus(KEY, ENDPOINT, status, () => {})
  }

  afterEach(() => {
    stop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('switches the pill to Ready and lists the MP4 renditions after a check', async () => {
    subscribe(async () => ({ json: async () => ({ state: 'processing' }), ok: true }))
    await vi.advanceTimersByTimeAsync(0)
    expect(renderField(PROCESSING)).toBe(card(plainPill('Processing', 'warning')))

    fetchMock.mockResolvedValueOnce({
      json: async () => ({ resolutions: { available: ['720p', '1080p'], highest: '1080p' }, state: 'ready' }),
      ok: true,
    })
    refreshStreamStatus(KEY)
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenLastCalledWith(ENDPOINT, expect.objectContaining({ credentials: 'include' }))
    expect(renderField(PROCESSING)).toBe(card(plainPill('Ready', 'success'), { button: '', mp4: '720p, 1080p' }))
  })

  it('switches the pill to Ready only when the player on the page is ready', async () => {
    subscribe(async () => ({ json: async () => ({ state: 'ready' }), ok: true }))
    registerPlayer(KEY)
    await vi.advanceTimersByTimeAsync(0)
    expect(renderField(PROCESSING)).toBe(card(plainPill('Processing', 'warning')))

    markPlayerReady(KEY)
    expect(renderField(PROCESSING)).toBe(card(plainPill('Ready', 'success'), { button: '' }))
  })

  it('does not read the status of the stored video for a replaced video', async () => {
    subscribe(async () => ({ json: async () => ({ state: 'ready' }), ok: true }), 'ready')
    await vi.advanceTimersByTimeAsync(0)

    expect(
      renderField({ 'bunnyData.stream.videoId': VIDEO_ID, bunnyStream: 'ready' }, 'media', 1, { videoId: 'vid-old' }),
    ).toBe(card(plainPill('Processing', 'warning'), { button: '' }))
  })

  it('tells screen readers when a check finds the video still processing and clears it on the next check', async () => {
    subscribe(async () => ({ json: async () => ({ state: 'processing' }), ok: true }))
    await vi.advanceTimersByTimeAsync(0)
    expect(renderField(PROCESSING)).toBe(card(plainPill('Processing', 'warning')))

    refreshStreamStatus(KEY)
    await vi.advanceTimersByTimeAsync(0)
    expect(renderField(PROCESSING)).toBe(card(plainPill('Processing', 'warning'), { error: STILL_PROCESSING }))

    fetchMock.mockReturnValueOnce(new Promise(() => {}))
    refreshStreamStatus(KEY)
    expect(renderField(PROCESSING)).toBe(card(plainPill('Processing', 'warning'), { button: check(true) }))
  })

  it('keeps the stored status and shows a short message when the check fails', async () => {
    subscribe(async () => {
      throw new Error('network')
    })
    await vi.advanceTimersByTimeAsync(0)
    refreshStreamStatus(KEY)
    await vi.advanceTimersByTimeAsync(0)

    expect(renderField(PROCESSING)).toBe(card(plainPill('Processing', 'warning'), { error: ERROR }))
  })
})
