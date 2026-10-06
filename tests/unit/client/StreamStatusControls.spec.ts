import { createElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { StreamStatusField } from '@/client/StreamStatus/StreamStatus.js'

type Node = { children: Node[]; focus: () => void; props: Record<string, any>; text: string; type: string }

const hooks = vi.hoisted(() => ({
  cursor: 0,
  effects: [] as (() => (() => void) | void)[],
  refs: [] as { current: unknown }[],
  states: [] as unknown[],
}))

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  return {
    ...react,
    useLayoutEffect: (effect: () => (() => void) | void) => void hooks.effects.push(effect),
    useRef: (initial: unknown) => {
      const index = hooks.cursor++
      hooks.refs[index] ??= { current: initial }
      return hooks.refs[index]
    },
    useState: <T>(initial: T) => {
      const index = hooks.cursor++
      if (!(index in hooks.states)) {
        hooks.states[index] = initial
      }
      return [hooks.states[index], (value: T) => void (hooks.states[index] = value)]
    },
  }
})

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
    state: 'processing',
  }),
}))

const toNodes = (node: ReactNode): Node[] => {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return []
  }
  if (Array.isArray(node)) {
    return node.flatMap(toNodes)
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return [{ children: [], focus: () => {}, props: {}, text: String(node), type: '#text' }]
  }
  const { props, type } = node as ReactElement<Record<string, any>>
  if (typeof type === 'function') {
    return toNodes((type as (props: object) => ReactNode)(props))
  }
  if (typeof type !== 'string') {
    return toNodes(props.children)
  }
  const children = toNodes(props.children)
  const host: Node = { children, focus: vi.fn(), props, text: children.map((child) => child.text).join(''), type }
  if (props.ref) {
    props.ref.current = host
  }
  return [host]
}

const findAll = (nodes: Node[], match: (node: Node) => boolean): Node[] =>
  nodes.flatMap((node) => [...(match(node) ? [node] : []), ...findAll(node.children, match)])

const render = () => {
  hooks.cursor = 0
  hooks.effects = []
  const nodes = toNodes(createElement(StreamStatusField, { path: 'bunnyStream' } as never))
  const find = (label: string) => findAll(nodes, (node) => node.props['aria-label'] === label)[0]!
  return {
    check: find('Check status now'),
    copy: find('Copy video ID'),
    live: findAll(nodes, (node) => node.props['aria-live'] === 'polite' && node.props.className === 'sr-only')[0]!,
  }
}

const tooltip = (node: Node) => findAll(node.children, (child) => child.props.role === 'tooltip')[0]!

describe('StreamStatusField controls', () => {
  beforeEach(() => {
    hooks.refs = []
    hooks.states = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows and announces Copied after a click and resets it on blur and on pointer leave', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    for (const leave of ['onBlur', 'onPointerLeave']) {
      await render().copy.props.onClick()
      const copied = render()
      expect(writeText).toHaveBeenLastCalledWith('vid-1')
      expect(tooltip(copied.copy).props['data-show']).toBe('true')
      expect(tooltip(copied.copy).text).toBe('Copied')
      expect(copied.live.text).toBe('Copied')

      copied.copy.props[leave]()
      const reset = render()
      expect(tooltip(reset.copy).text).toBe('Copy video ID')
      expect(reset.live.text).toBe('')
    }
  })

  it('shows and announces a failed copy', async () => {
    vi.stubGlobal('navigator', {})

    await render().copy.props.onClick()
    const failed = render()
    expect(tooltip(failed.copy).text).toBe('Unable to copy')
    expect(failed.live.text).toBe('Unable to copy')
  })

  it('moves the focus to the status when the focused check button goes away', () => {
    const { check } = render()
    const cleanup = hooks.effects.map((effect) => effect()).find(Boolean)!
    const status = hooks.refs.find((ref) => (ref.current as Node | undefined)?.props?.tabIndex === -1)!.current as Node

    vi.stubGlobal('document', { activeElement: check })
    cleanup()
    expect(status.focus).toHaveBeenCalledOnce()
  })

  it('keeps the focus where it is when the check button was not focused', () => {
    render()
    const cleanup = hooks.effects.map((effect) => effect()).find(Boolean)!
    const status = hooks.refs.find((ref) => (ref.current as Node | undefined)?.props?.tabIndex === -1)!.current as Node

    vi.stubGlobal('document', { activeElement: null })
    cleanup()
    expect(status.focus).not.toHaveBeenCalled()
  })
})
