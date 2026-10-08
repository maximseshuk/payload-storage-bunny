import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FileManager } from '@/client/TusUpload/FileManager/FileManager.js'

const state = vi.hoisted(() => ({
  cursor: 0,
  refCursor: 0,
  refs: [] as { current: unknown }[],
  states: [] as unknown[],
  toastError: vi.fn(),
}))

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  return {
    ...react,
    useEffect: (effect: () => void) => effect(),
    useRef: <T>(initial: T) => {
      const index = state.refCursor++
      state.refs[index] ??= { current: initial }
      return state.refs[index]
    },
    useState: <T>(initial: T) => {
      const index = state.cursor++
      if (!(index in state.states)) {
        state.states[index] = initial
      }
      return [
        state.states[index],
        (value: ((prev: T) => T) | T) =>
          void (state.states[index] =
            typeof value === 'function' ? (value as (prev: T) => T)(state.states[index] as T) : value),
      ]
    },
  }
})

vi.mock('@payloadcms/ui', () => ({
  Button: () => null,
  Dropzone: () => null,
  ErrorIcon: () => null,
  Spinner: () => null,
  SuccessIcon: () => null,
  TextInput: () => null,
  toast: { error: state.toastError },
  useConfig: () => ({
    config: { routes: { api: '/api' }, serverURL: '' },
    getEntityConfig: () => ({
      admin: { custom: { '@seshuk/payload-storage-bunny': { stream: { mimeTypes: ['video/*'] } } } },
    }),
  }),
  useDocumentEvents: () => ({}),
  useForm: () => ({ dispatchFields: vi.fn(), setBackgroundProcessing: vi.fn() }),
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@payloadcms/ui/elements/FileManager/FilePreview/VideoPreview', () => ({ VideoPreview: () => null }))
vi.mock('@/client/TusUpload/ToggleButton/ToggleButton.js', () => ({ ToggleButton: () => null }))
vi.mock('@/client/TusUpload/FileManager/FileManager.utils.js', () => ({
  cleanupTusLocalStorage: vi.fn(),
  findPreviousTusUploads: vi.fn(async () => []),
}))

const render = (preSelectedFile: File) => {
  state.cursor = 0
  state.refCursor = 0
  renderToStaticMarkup(createElement(FileManager, { collectionSlug: 'media', onDisableTus() {}, preSelectedFile }))
}

const selectedFile = () => (state.states[0] as { selectedFile: File | null }).selectedFile

describe('TUS FileManager pre-selected file', () => {
  const first = new File(['first'], 'first.mp4', { type: 'video/mp4' })

  beforeEach(() => {
    state.refs = []
    state.states = []
    state.toastError.mockClear()
    vi.stubGlobal('FileList', Array)
  })

  it('replaces the selected file with a new pre-selected file but not with an earlier one', () => {
    const second = new File(['second'], 'second.mp4', { type: 'video/mp4' })
    render(first)
    expect(selectedFile()).toBe(first)

    render(second)
    expect(selectedFile()).toBe(second)
    expect(state.toastError).not.toHaveBeenCalled()

    render(first)
    expect(selectedFile()).toBe(second)
  })

  it('aborts the running TUS upload when a new pre-selected file replaces the selected file', () => {
    render(first)
    const upload = { abort: vi.fn(async () => {}) }
    state.refs[1]!.current = upload

    render(new File(['second'], 'second.mp4', { type: 'video/mp4' }))

    expect(upload.abort).toHaveBeenCalledTimes(1)
    expect(state.refs[1]!.current).toBeNull()
  })

  it('keeps the selected file and shows the file type error for a non-Stream pre-selected file', () => {
    render(first)
    const upload = { abort: vi.fn(async () => {}) }
    state.refs[1]!.current = upload
    render(new File(['image'], 'photo.jpg', { type: 'image/jpeg' }))

    expect(selectedFile()).toBe(first)
    expect(upload.abort).not.toHaveBeenCalled()
    expect(state.toastError).toHaveBeenCalledWith('@seshuk/payload-storage-bunny:tusUploadErrorFileType')
  })
})
