import { act, fireEvent, render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FileManager } from '@/client/TusUpload/FileManager/FileManager.js'
import { TusUpload } from '@/client/TusUpload/TusUpload.js'
import { clickFileFieldRemoveButton } from '@/client/TusUpload/TusUpload.utils.js'

const state = vi.hoisted(() => ({
  bulk: false,
  dispatchFields: vi.fn(),
  doc: {} as Record<string, unknown>,
  field: undefined as { value: File } | undefined,
  hasRemoveButton: false,
  removeFile: vi.fn(),
  tus: undefined as Record<string, unknown> | undefined,
}))

vi.mock('@payloadcms/ui', () => ({
  useBulkUpload: () => (state.bulk ? { collectionSlug: 'media', modalSlug: 'bulk' } : {}),
  useConfig: () => ({
    getEntityConfig: () => ({
      admin: { custom: { '@seshuk/payload-storage-bunny': { stream: { mimeTypes: ['video/*'], tus: state.tus } } } },
      slug: 'media',
      upload: {},
    }),
  }),
  useDocumentInfo: () => ({ collectionSlug: 'media', data: state.doc, initialState: {} }),
  useForm: () => ({ dispatchFields: state.dispatchFields }),
  useFormFields: (selector: (fields: [Record<string, unknown>]) => unknown) => selector([{ file: state.field }]),
  useModal: () => ({ isModalOpen: () => true }),
  useUploadControls: () => ({ setUploadControlFile() {}, setUploadControlFileName() {}, setUploadControlFileUrl() {} }),
  useUploadEdits: () => ({ resetUploadEdits() {} }),
}))

vi.mock('@/client/vendor/payload/elements/FileManager/index.js', async () => {
  const { createElement: h } = await import('react')
  return {
    FileManager: ({ UploadControls }: { UploadControls?: ReactNode }) =>
      h(
        'div',
        { 'data-testid': 'payload-file-manager' },
        h(
          'div',
          { className: 'file-manager__upload' },
          state.hasRemoveButton &&
            h('button', { className: 'file-manager__remove', onClick: state.removeFile }, 'Remove'),
        ),
        h('div', { 'data-testid': 'payload-controls' }, UploadControls),
      ),
  }
})
vi.mock('@/client/TusUpload/FileManager/FileManager.js', async () => {
  const { createElement: h } = await import('react')
  return {
    FileManager: vi.fn((props: { onCancel: () => void; onDisableTus: () => void; UploadControls?: ReactNode }) =>
      h(
        'div',
        { 'data-testid': 'tus-file-manager' },
        h('button', { onClick: props.onCancel }, 'Cancel TUS'),
        h('button', { onClick: props.onDisableTus }, 'Disable TUS'),
        props.UploadControls,
      ),
    ),
  }
})
vi.mock('@/client/TusUpload/ToggleButton/ToggleButton.js', async () => {
  const { createElement: h } = await import('react')
  return { ToggleButton: ({ onToggle }: { onToggle: () => void }) => h('button', { onClick: onToggle }, 'TUS') }
})

const CONTROLS = '<button>Import</button>'

const upload = ({ controls = true } = {}) =>
  createElement(TusUpload, { UploadControls: controls ? createElement('button', null, 'Import') : undefined })

const renderUpload = (tus: Record<string, unknown> | undefined, { bulk = false, controls = true } = {}) => {
  state.bulk = bulk
  state.tus = tus
  const view = render(upload({ controls }))
  return { ...view, rerender: () => view.rerender(upload({ controls })) }
}

const payloadFileManager = () => screen.getByTestId('payload-file-manager').parentElement!
const tusFileManager = () => screen.queryByTestId('tus-file-manager')
const preSelectedFiles = () => vi.mocked(FileManager).mock.calls.map(([props]) => props.preSelectedFile)
const enableTus = () => fireEvent.click(screen.getByRole('button', { name: 'TUS' }))

beforeEach(() => {
  state.dispatchFields.mockClear()
  state.doc = {}
  state.field = undefined
  state.hasRemoveButton = false
  state.removeFile.mockClear()
  vi.mocked(FileManager).mockClear()
})

describe('TusUpload controls', () => {
  it.each([
    ['the custom upload controls next to the TUS toggle', {}, {}, `${CONTROLS}<button>TUS</button>`],
    ['only the custom upload controls in auto mode', { autoMode: true }, {}, CONTROLS],
    ['only the custom upload controls without TUS', undefined, {}, CONTROLS],
    ['only the TUS toggle without custom upload controls', {}, { controls: false }, '<button>TUS</button>'],
    ['no controls in the bulk upload', {}, { bulk: true }, ''],
  ])('renders %s', (_label, tus, options, html) => {
    renderUpload(tus, options)

    expect(payloadFileManager().style.display).toBe('contents')
    expect(screen.getByTestId('payload-controls').innerHTML).toBe(html)
    expect(tusFileManager()).toBeNull()
  })
})

describe('TusUpload form file', () => {
  const video = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
  const clearFile = { type: 'UPDATE', path: 'file', value: null }

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('clears the form file when auto mode switches to TUS and the remove button is not found', async () => {
    vi.useFakeTimers()
    state.field = { value: video }
    const { rerender } = renderUpload({ autoMode: true })
    expect(state.dispatchFields).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(5000))

    expect(tusFileManager()).not.toBeNull()
    expect(state.dispatchFields).toHaveBeenCalledWith(clearFile)

    state.field = undefined
    rerender()
    expect(preSelectedFiles().at(-1)).toBe(video)
  })

  it('clears a file that reaches the hidden form field while TUS mode is on and hands it to the TUS upload', () => {
    const photo = new File(['image'], 'photo.jpg', { type: 'image/jpeg' })
    const { rerender } = renderUpload({})
    enableTus()

    state.field = { value: photo }
    rerender()

    expect(state.dispatchFields).toHaveBeenCalledWith(clearFile)
    expect(preSelectedFiles().at(-1)).toBe(photo)
  })

  it('clears the form file again when the same file comes back into the form field', () => {
    const { rerender } = renderUpload({})
    enableTus()
    state.field = { value: video }
    rerender()
    rerender()
    expect(state.dispatchFields).toHaveBeenCalledOnce()

    state.field = { value: video }
    rerender()

    expect(state.dispatchFields).toHaveBeenCalledTimes(2)
    expect(state.dispatchFields).toHaveBeenLastCalledWith(clearFile)
  })

  it('renders the custom upload controls in TUS mode', () => {
    renderUpload({})
    enableTus()

    expect(payloadFileManager().style.display).toBe('none')
    expect(screen.getByTestId('payload-controls').innerHTML).toBe(`${CONTROLS}<button>TUS</button>`)
    expect(tusFileManager()!.innerHTML).toContain(CONTROLS)
  })

  it('keeps the form file when TUS mode is off', () => {
    state.field = { value: new File(['image'], 'photo.jpg', { type: 'image/jpeg' }) }
    renderUpload({ autoMode: true })

    expect(state.dispatchFields).not.toHaveBeenCalled()
    expect(tusFileManager()).toBeNull()
  })

  it('does nothing in TUS mode without a form file', () => {
    renderUpload({})
    enableTus()

    expect(tusFileManager()).not.toBeNull()
    expect(state.dispatchFields).not.toHaveBeenCalled()
  })

  it.each([
    ['without waiting for a remove button that is not there', false, 0],
    ['and removes the file of the form', true, 1],
  ])('turns TUS mode off in auto mode %s', async (_label, hasRemoveButton, clicks) => {
    state.hasRemoveButton = true
    state.field = { value: video }
    const { rerender } = renderUpload({ autoMode: true })
    await act(async () => {})
    expect(tusFileManager()).not.toBeNull()

    state.field = undefined
    state.hasRemoveButton = hasRemoveButton
    state.removeFile.mockClear()
    rerender()
    const observer = vi.fn()
    vi.stubGlobal('MutationObserver', observer)

    fireEvent.click(screen.getByRole('button', { name: 'Disable TUS' }))

    expect(state.removeFile).toHaveBeenCalledTimes(clicks)
    expect(observer).not.toHaveBeenCalled()
    expect(tusFileManager()).toBeNull()
    expect(payloadFileManager().style.display).toBe('contents')
  })

  it.each([
    ['turns TUS mode off and shows the saved file again', 'with', { filename: 'old.mp4' }, 1, false],
    ['keeps TUS mode on', 'without', {}, 0, true],
  ])('%s when Cancel runs on a document %s a file', (_label, _with, doc, clicks, isTusMode) => {
    state.doc = doc
    state.hasRemoveButton = true
    renderUpload({})
    enableTus()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel TUS' }))

    expect(state.removeFile).toHaveBeenCalledTimes(clicks)
    expect(tusFileManager() !== null).toBe(isTusMode)
  })
})

describe('clickFileFieldRemoveButton', () => {
  it('resolves false without a file field', async () => {
    await expect(clickFileFieldRemoveButton(null)).resolves.toBe(false)
  })
})
