import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { StreamStatusField } from '@/client/StreamStatus/StreamStatus.js'

const live = vi.hoisted(() => ({ state: 'processing' }))

vi.mock('@payloadcms/ui', async () => {
  const { createElement: h } = await import('react')
  const { en } = await import('@/shared/translations/locales/en.js')
  const messages: Record<string, string> = {
    ...en['@seshuk/payload-storage-bunny'],
    copied: 'Copied',
    status: 'Status',
    unableToCopy: 'Unable to copy',
  }
  return {
    CopyIcon: () => h('svg'),
    FieldLabel: ({ label }: { label: string }) => h('span', null, label),
    NewTabIcon: () => h('svg'),
    RefreshIcon: () => h('svg'),
    Tooltip: ({ children, show }: { children: string; show: boolean }) =>
      h('span', { 'data-show': String(show), role: 'tooltip' }, children),
    useConfig: () => ({ getEntityConfig: () => undefined }),
    useDocumentInfo: () => ({ id: 1, collectionSlug: 'media', data: { bunnyData: { stream: { videoId: 'vid-1' } } } }),
    useFormFields: (selector: (state: [Record<string, { value: unknown }>]) => unknown) =>
      selector([{ 'bunnyData.stream.videoId': { value: 'vid-1' } }]),
    useTranslation: () => ({ t: (key: string) => messages[key.split(':')[1]!] }),
  }
})

vi.mock('@/client/StreamStatus/streamStatusStore.js', () => ({
  useStreamStatus: () => ({
    checking: false,
    error: false,
    key: 'media:1:vid-1',
    refresh: () => {},
    state: live.state,
  }),
}))

const field = () => createElement(StreamStatusField, { path: 'bunnyStream' } as never)

const renderField = () => {
  const view = render(field())
  return {
    ...view,
    announcement: () => view.container.querySelector('[aria-live="polite"].sr-only')!.textContent,
    copy: screen.getByRole('button', { name: 'Copy video ID' }),
    status: () => view.container.querySelector<HTMLElement>('[tabindex="-1"]')!,
  }
}

const tooltip = (button: HTMLElement) => within(button).getByRole('tooltip')

describe('StreamStatusField controls', () => {
  beforeEach(() => {
    live.state = 'processing'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows and announces Copied after a click and resets it on blur and on pointer leave', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { announcement, copy } = renderField()

    for (const leave of [fireEvent.blur, fireEvent.pointerLeave]) {
      await act(async () => fireEvent.click(copy))
      expect(writeText).toHaveBeenLastCalledWith('vid-1')
      expect(tooltip(copy).dataset.show).toBe('true')
      expect(tooltip(copy).textContent).toBe('Copied')
      expect(announcement()).toBe('Copied')

      leave(copy)
      expect(tooltip(copy).textContent).toBe('Copy video ID')
      expect(announcement()).toBe('')
    }
  })

  it.each([
    ['without the clipboard API', {}],
    ['when the clipboard rejects', { clipboard: { writeText: async () => Promise.reject(new Error('denied')) } }],
  ])('shows and announces a failed copy %s', async (_label, navigator) => {
    vi.stubGlobal('navigator', navigator)
    const { announcement, copy } = renderField()

    await act(async () => fireEvent.click(copy))
    expect(tooltip(copy).textContent).toBe('Unable to copy')
    expect(announcement()).toBe('Unable to copy')
  })

  it('moves the focus to the status when the focused check button goes away', () => {
    const { rerender, status } = renderField()
    screen.getByRole('button', { name: 'Check status now' }).focus()

    live.state = 'ready'
    rerender(field())

    expect(screen.queryByRole('button', { name: 'Check status now' })).toBeNull()
    expect(document.activeElement).toBe(status())
  })

  it('keeps the focus where it is when the check button was not focused', () => {
    const { copy, rerender } = renderField()
    copy.focus()

    live.state = 'ready'
    rerender(field())

    expect(screen.queryByRole('button', { name: 'Check status now' })).toBeNull()
    expect(document.activeElement).toBe(copy)
  })
})
