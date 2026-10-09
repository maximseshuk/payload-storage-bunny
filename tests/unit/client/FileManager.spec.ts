import { createRequire } from 'node:module'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FileManager } from '@/client/TusUpload/FileManager/FileManager.js'
import { findPreviousTusUploads } from '@/client/TusUpload/FileManager/FileManager.utils.js'

const state = vi.hoisted(() => ({
  backgroundProcessing: false,
  buttons: [] as Record<string, unknown>[],
  cleanups: [] as ((() => void) | undefined)[],
  cursor: 0,
  dispatchFields: vi.fn(),
  effectCursor: 0,
  effectDeps: [] as (undefined | unknown[])[],
  form: {} as Record<string, any>,
  pendingAuth: [] as ((value: unknown) => void)[],
  pendingPrevious: [] as ((value: unknown) => void)[],
  refCursor: 0,
  refs: [] as { current: unknown }[],
  setBackgroundProcessing: vi.fn(),
  setModified: vi.fn(),
  states: [] as unknown[],
  toastError: vi.fn(),
  uploads: [] as { abort: ReturnType<typeof vi.fn>; opts: Record<string, any>; start: ReturnType<typeof vi.fn> }[],
}))

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  return {
    ...react,
    useEffect: (effect: () => (() => void) | void, deps?: unknown[]) => {
      const index = state.effectCursor++
      const previous = state.effectDeps[index]
      if (previous && deps?.every((dep, position) => Object.is(dep, previous[position]))) {
        return
      }
      state.effectDeps[index] = deps
      state.cleanups[index]?.()
      state.cleanups[index] = effect() ?? undefined
    },
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
  Button: (props: Record<string, unknown>) => {
    state.buttons.push(props)
    return null
  },
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
  useForm: () => ({
    dispatchFields: state.dispatchFields,
    getFields: () => state.form,
    setBackgroundProcessing: state.setBackgroundProcessing,
    setModified: state.setModified,
  }),
  useFormBackgroundProcessing: () => state.backgroundProcessing,
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('ky', () => ({
  default: { post: () => ({ json: () => new Promise((resolve) => state.pendingAuth.push(resolve)) }) },
}))

vi.mock('tus-js-client', () => ({
  Upload: class {
    abort = vi.fn(async () => {})
    findPreviousUploads = vi.fn(async () => [])
    opts: Record<string, any>
    start = vi.fn()
    constructor(_file: File, opts: Record<string, any>) {
      this.opts = opts
      state.uploads.push(this as never)
    }
  },
}))

vi.mock('@payloadcms/ui/elements/FileManager/FilePreview/VideoPreview', () => ({ VideoPreview: () => null }))
vi.mock('@/client/TusUpload/ToggleButton/ToggleButton.js', () => ({ ToggleButton: () => null }))
vi.mock('@/client/TusUpload/FileManager/FileManager.utils.js', () => ({
  cleanupTusLocalStorage: vi.fn(),
  findPreviousTusUploads: vi.fn(async () => []),
}))

const { fieldReducer } = await vi.importActual<typeof import('@payloadcms/ui')>(
  createRequire(import.meta.url)
    .resolve('@payloadcms/ui')
    .replace('exports/client/index.js', 'forms/Form/fieldReducer.js'),
)

const onDisableTus = vi.fn()

const render = (preSelectedFile: File | null, isAutoMode = false) => {
  state.cursor = 0
  state.refCursor = 0
  state.buttons = []
  state.effectCursor = 0
  renderToStaticMarkup(
    createElement(FileManager, { collectionSlug: 'media', isAutoMode, onDisableTus, preSelectedFile }),
  )
}

const ui = () => state.states[0] as { fileName: string; selectedFile: File | null; uploadStatus: string }
const selectedFile = () => ui().selectedFile
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const click = (match: (props: Record<string, unknown>) => boolean) =>
  void (state.buttons.find(match)!.onClick as () => unknown)()
const startUpload = () => click((props) => props.children === '@seshuk/payload-storage-bunny:tusUploadStartUpload')
const cancel = () => click((props) => props.tooltip === 'general:cancel')
const uploadAuth = {
  authorizationExpire: 1,
  authorizationSignature: 'signature',
  libraryId: 1,
  type: 'upload',
  videoId: 'video-x',
  videoToken: 'token',
}
const formValues = () => Object.fromEntries(Object.entries(state.form).map(([path, field]) => [path, field.value]))
const formState = (values: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(values).map(([path, value]) => [path, { initialValue: value, value }]))

beforeEach(() => {
  state.backgroundProcessing = false
  state.cleanups = []
  state.effectDeps = []
  state.setBackgroundProcessing.mockClear()
  state.refs = []
  state.states = []
  state.uploads = []
  state.pendingAuth = []
  state.pendingPrevious = []
  state.form = {}
  state.setModified.mockClear()
  state.dispatchFields.mockClear()
  state.dispatchFields.mockImplementation((action) => void (state.form = fieldReducer(state.form, action)))
  state.toastError.mockClear()
  onDisableTus.mockClear()
  vi.mocked(findPreviousTusUploads).mockImplementation(async () => [])
  vi.stubGlobal('FileList', Array)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:file', revokeObjectURL: () => {} }))
})

describe('TUS FileManager pre-selected file', () => {
  const first = new File(['first'], 'first.mp4', { type: 'video/mp4' })

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

describe('TUS FileManager when the file changes while the upload starts', () => {
  const x = new File(['x'], 'x.mp4', { type: 'video/mp4' })
  const y = new File(['y'], 'y.mp4', { type: 'video/mp4' })

  const prepare = async (isAutoMode = false) => {
    render(x, isAutoMode)
    await flush()
    render(x, isAutoMode)
    startUpload()
    render(x, isAutoMode)
    expect(ui().uploadStatus).toBe('preparing')
  }

  it.each([false, true])(
    'starts no upload when Cancel runs while tus-auth is pending (auto mode %s)',
    async (isAutoMode) => {
      await prepare(isAutoMode)

      cancel()
      state.pendingAuth[0]!(uploadAuth)
      await flush()

      expect(state.uploads).toHaveLength(0)
      expect(ui().selectedFile).toBeNull()
      expect(ui().uploadStatus).toBe('idle')
      expect(formValues()).toEqual({})
    },
  )

  it('starts no upload for the old file when a new file is selected while tus-auth is pending', async () => {
    await prepare()

    render(y)
    await flush()
    state.pendingAuth[0]!(uploadAuth)
    await flush()

    expect(state.uploads).toHaveLength(0)
    expect(ui().selectedFile).toBe(y)
    expect(ui().uploadStatus).toBe('idle')
  })

  it('starts no upload after the FileManager unmounts while tus-auth is pending', async () => {
    await prepare()

    for (const cleanup of state.cleanups) {
      cleanup?.()
    }
    state.pendingAuth[0]!(uploadAuth)
    await flush()

    expect(state.uploads).toHaveLength(0)
    expect(formValues()).toEqual({})
  })

  it('ignores the success of an upload whose file is no longer selected', async () => {
    await prepare()
    state.pendingAuth[0]!(uploadAuth)
    await flush()
    expect(state.uploads[0]!.start).toHaveBeenCalled()

    render(y)
    expect(state.uploads[0]!.abort).toHaveBeenCalled()
    state.uploads[0]!.opts.onSuccess()
    await flush()

    expect(formValues()).toEqual({})
    expect(ui().selectedFile).toBe(y)
  })

  it('ignores the previous-upload check of a file that is no longer selected', async () => {
    vi.mocked(findPreviousTusUploads).mockImplementation(
      (file: File) =>
        (file === x ? new Promise((resolve) => state.pendingPrevious.push(resolve)) : Promise.resolve([])) as never,
    )
    render(x)
    render(y)
    await flush()

    state.pendingPrevious[0]!([{ metadata: { title: 'old-x', videoId: 'video-old' } }])
    await flush()

    expect(ui()).toMatchObject({ canRestore: false, fileName: 'y.mp4', selectedFile: y, uploadStatus: 'idle' })
    expect(state.pendingAuth).toHaveLength(0)
  })

  it('keeps the form MIME type on select and Cancel and sets it after the upload', async () => {
    state.form = formState({ mimeType: 'image/png' })
    await prepare()
    cancel()
    expect(formValues()).toEqual({ mimeType: 'image/png' })

    state.refs = []
    state.states = []
    state.effectDeps = []
    await prepare()
    state.pendingAuth[1]!(uploadAuth)
    await flush()
    state.uploads[0]!.opts.onSuccess()
    await flush()

    expect(formValues()).toMatchObject({ mimeType: 'video/mp4' })
  })

  it('keeps the uploaded video in the form when an autosave that started before the end of the upload answers', async () => {
    const saved = {
      'bunnyData.stream.videoId': 'video-old',
      'bunnyData.stream.videoToken': null,
      filename: 'old.webm',
      filesize: 10,
      focalX: 50,
      focalY: 50,
      height: 360,
      mimeType: 'video/webm',
      width: 640,
    }
    state.form = formState(saved)
    await prepare()
    state.pendingAuth[0]!(uploadAuth)
    await flush()
    state.uploads[0]!.opts.onSuccess()
    await flush()

    state.dispatchFields({
      type: 'MERGE_SERVER_STATE',
      acceptValues: { overrideLocalChanges: false },
      serverState: formState(saved),
    })

    expect(formValues()).toEqual({
      'bunnyData.stream.videoId': 'video-x',
      'bunnyData.stream.videoToken': 'token',
      filename: 'x.mp4',
      filesize: 1,
      focalX: null,
      focalY: null,
      height: null,
      mimeType: 'video/mp4',
      width: null,
    })
  })

  it('turns background processing on again when an autosave turns it off during the upload', async () => {
    await prepare()
    state.backgroundProcessing = true
    render(x)
    state.setBackgroundProcessing.mockClear()

    state.backgroundProcessing = false
    render(x)

    expect(state.setBackgroundProcessing).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('leaves the background processing of an autosave alone when no file is selected', () => {
    render(null)
    state.setBackgroundProcessing.mockClear()

    state.backgroundProcessing = true
    render(null)

    expect(state.setBackgroundProcessing).not.toHaveBeenCalled()
  })

  it('turns background processing off when the upload is complete', async () => {
    await prepare()
    state.pendingAuth[0]!(uploadAuth)
    await flush()
    state.uploads[0]!.opts.onSuccess()
    await flush()
    render(x)

    expect(state.setBackgroundProcessing).toHaveBeenLastCalledWith(false)
  })

  it.each([false, true])(
    'puts the previous video back into the form when Cancel runs after the upload (auto mode %s)',
    async (isAutoMode) => {
      const saved = { 'bunnyData.stream.videoId': 'video-old', filename: 'old.webm', mimeType: 'video/webm' }
      state.form = formState(saved)
      await prepare(isAutoMode)
      state.pendingAuth[0]!(uploadAuth)
      await flush()
      state.uploads[0]!.opts.onSuccess()
      await flush()
      render(x, isAutoMode)
      expect(formValues()).toMatchObject({ 'bunnyData.stream.videoId': 'video-x' })

      cancel()

      expect(formValues()).toEqual(saved)
      expect(state.form).toEqual(formState(saved))
    },
  )

  it('marks the form as modified when the upload is complete, so Save and autosave see the new video', async () => {
    await prepare()
    state.pendingAuth[0]!(uploadAuth)
    await flush()
    expect(state.setModified).not.toHaveBeenCalled()

    state.uploads[0]!.opts.onSuccess()
    await flush()

    expect(state.setModified).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('turns background processing off when the FileManager unmounts during the upload', async () => {
    await prepare(true)
    cancel()
    state.setBackgroundProcessing.mockClear()

    for (const cleanup of state.cleanups) {
      cleanup?.()
    }

    expect(state.setBackgroundProcessing).toHaveBeenCalledExactlyOnceWith(false)
  })
})
