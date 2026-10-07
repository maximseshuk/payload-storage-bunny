import { createRequire } from 'node:module'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FileManager } from '@/client/TusUpload/FileManager/FileManager.js'
import { findPreviousTusUploads } from '@/client/TusUpload/FileManager/FileManager.utils.js'
import { TusRenewError } from '@/client/TusUpload/tusAuth.js'

const state = vi.hoisted(() => ({
  backgroundProcessing: false,
  buttons: [] as Record<string, unknown>[],
  cleanups: [] as ((() => void) | undefined)[],
  cursor: 0,
  dispatchFields: vi.fn(),
  drafts: undefined as undefined | { autosave: boolean },
  documentEvents: {} as Record<string, unknown>,
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
  uploads: [] as {
    abort: ReturnType<typeof vi.fn>
    findPreviousUploads: ReturnType<typeof vi.fn>
    opts: Record<string, any>
    start: ReturnType<typeof vi.fn>
  }[],
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
      versions: state.drafts ? { drafts: state.drafts } : false,
    }),
  }),
  useDocumentEvents: () => state.documentEvents,
  useForm: () => ({
    dispatchFields: state.dispatchFields,
    getFields: () => state.form,
    setBackgroundProcessing: state.setBackgroundProcessing,
    setModified: state.setModified,
  }),
  useFormBackgroundProcessing: () => state.backgroundProcessing,
  useFormFields: (selector: (context: unknown) => unknown) => selector([state.form, state.dispatchFields]),
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

const onCancel = vi.fn()
const onDisableTus = vi.fn()

const render = (preSelectedFile: File | null, isAutoMode = false) => {
  state.cursor = 0
  state.refCursor = 0
  state.buttons = []
  state.effectCursor = 0
  renderToStaticMarkup(
    createElement(FileManager, { collectionSlug: 'media', isAutoMode, onCancel, onDisableTus, preSelectedFile }),
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
  expiresIn: 300,
  headers: { AuthorizationExpire: '1', AuthorizationSignature: 'signature', LibraryId: '1', VideoId: 'video-x' },
  libraryId: 1,
  type: 'upload',
  uploadUrl: 'https://video.bunnycdn.com/tusupload/upload-x',
  videoId: 'video-x',
  videoToken: 'token',
}
const formValues = () => Object.fromEntries(Object.entries(state.form).map(([path, field]) => [path, field.value]))
const formState = (values: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(values).map(([path, value]) => [path, { initialValue: value, value }]))

beforeEach(() => {
  state.backgroundProcessing = false
  state.drafts = undefined
  state.documentEvents = {}
  state.cleanups = []
  state.effectDeps = []
  state.setBackgroundProcessing.mockReset()
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
  onCancel.mockClear()
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

  it('sends the file to the upload that the server created and renews its headers before a request', async () => {
    await prepare()
    state.pendingAuth[0]!({ ...uploadAuth, expiresIn: 30 })
    await flush()
    const { opts } = state.uploads[0]!

    expect(opts.uploadUrl).toBe(uploadAuth.uploadUrl)
    expect(opts).not.toHaveProperty('headers')
    expect(opts).not.toHaveProperty('endpoint')
    expect(opts.metadata).toMatchObject({ videoId: 'video-x', videoToken: 'token' })

    const setHeader = vi.fn()
    const renewal = opts.onBeforeRequest({ setHeader })
    await flush()
    state.pendingAuth[1]!({ ...uploadAuth, headers: { ...uploadAuth.headers, AuthorizationSignature: 'renewed' } })
    await renewal

    expect(setHeader).toHaveBeenCalledWith('AuthorizationSignature', 'renewed')
  })

  it.each([
    ['Bunny no longer knows', () => ({ originalResponse: { getStatus: () => 404 } })],
    ['tus-auth cannot renew', () => ({ causingError: new TusRenewError() })],
  ])('replaces an upload that %s with a new one from tus-auth, once', async (_label, cause) => {
    await prepare()
    state.pendingAuth[0]!(uploadAuth)
    await flush()
    const lost = Object.assign(new Error('tus: unexpected response'), cause())

    state.uploads[0]!.opts.onError(lost)
    await flush()
    render(x)
    expect(state.pendingAuth).toHaveLength(2)
    const replacement = {
      ...uploadAuth,
      uploadUrl: `${uploadAuth.uploadUrl}-2`,
      videoId: 'video-y',
      videoToken: 'token-2',
    }
    state.pendingAuth[1]!(replacement)
    await flush()

    expect(state.uploads).toHaveLength(2)
    expect(state.uploads[1]!.opts.uploadUrl).toBe(replacement.uploadUrl)
    expect(state.uploads[1]!.start).toHaveBeenCalled()
    expect(ui().uploadStatus).toBe('uploading')

    state.uploads[1]!.opts.onError(lost)
    await flush()
    expect(state.pendingAuth).toHaveLength(2)
    expect(ui().uploadStatus).toBe('error')
  })

  it('completes the upload when the renewal finds that the upload has already finished', async () => {
    await prepare()
    state.pendingAuth[0]!(uploadAuth)
    await flush()
    const finished = {
      libraryId: 1,
      requestedAt: 0,
      title: 'x',
      type: 'uploaded',
      videoId: 'video-x',
      videoToken: 'token',
    }

    state.uploads[0]!.opts.onError(
      Object.assign(new Error('tus'), { causingError: new TusRenewError(finished as never) }),
    )
    await flush()
    render(x)

    expect(state.pendingAuth).toHaveLength(1)
    expect(ui().uploadStatus).toBe('completed')
    expect(formValues()).toMatchObject({
      'bunnyData.stream.videoId': 'video-x',
      'bunnyData.stream.videoToken': 'token',
    })
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

  describe('after the upload', () => {
    const saved = {
      'bunnyData.stream.videoId': 'video-old',
      'bunnyData.stream.videoToken': null,
      alt: 'old alt',
      filename: 'old.webm',
      filesize: 10,
      focalX: 50,
      focalY: 50,
      height: 360,
      mimeType: 'video/webm',
      width: 640,
    }
    const uploaded = {
      'bunnyData.stream.videoId': 'video-x',
      'bunnyData.stream.videoToken': 'token',
      alt: 'new alt',
      filename: 'x.mp4',
      filesize: 1,
      focalX: null,
      focalY: null,
      height: null,
      mimeType: 'video/mp4',
      width: null,
    }

    const upload = async () => {
      state.form = formState(saved)
      await prepare()
      state.pendingAuth[0]!(uploadAuth)
      await flush()
      state.uploads[0]!.opts.onSuccess()
      await flush()
      render(x)
    }

    it('puts the uploaded video back when a stale autosave answer reverts the form after another field changes', async () => {
      await upload()
      state.dispatchFields({ type: 'UPDATE', path: 'alt', value: 'new alt' })

      state.dispatchFields({
        type: 'MERGE_SERVER_STATE',
        acceptValues: { overrideLocalChanges: false },
        serverState: formState({ ...saved, alt: 'new alt' }),
      })
      expect(formValues()).toMatchObject({ 'bunnyData.stream.videoId': 'video-old' })
      render(x)

      expect(formValues()).toEqual(uploaded)
      expect(state.setModified).toHaveBeenLastCalledWith(true)
    })

    it('puts the uploaded file fields back when a stale autosave answer without a video clears them after another field changes', async () => {
      await upload()
      state.dispatchFields({ type: 'UPDATE', path: 'alt', value: 'new alt' })

      state.dispatchFields({
        type: 'MERGE_SERVER_STATE',
        acceptValues: { overrideLocalChanges: false },
        serverState: formState({ alt: 'new alt', filename: null, filesize: null, mimeType: null }),
      })
      expect(formValues()).toMatchObject({ filename: null, filesize: null, mimeType: null })
      render(x)

      expect(formValues()).toEqual(uploaded)
      expect(state.setModified).toHaveBeenLastCalledWith(true)
    })

    it('marks the form as not modified when a save without autosave stores the uploaded video', async () => {
      await upload()
      state.setModified.mockClear()

      state.documentEvents = {
        mostRecentUpdate: { doc: { bunnyData: { stream: { videoId: 'video-x' } } }, updatedAt: '1' },
      }
      render(x)

      expect(state.setModified).toHaveBeenCalledExactlyOnceWith(false)
      expect(onDisableTus).toHaveBeenCalledOnce()
    })

    it('leaves the modified state to autosave when an autosave stores the uploaded video', async () => {
      state.drafts = { autosave: true }
      await upload()
      state.setModified.mockClear()

      state.documentEvents = {
        mostRecentUpdate: { doc: { bunnyData: { stream: { videoId: 'video-x' } } }, updatedAt: '1' },
      }
      render(x)

      expect(state.setModified).not.toHaveBeenCalled()
      expect(onDisableTus).toHaveBeenCalledOnce()
    })

    it('keeps the TUS uploader when a save answers with another video', async () => {
      await upload()

      state.documentEvents = {
        mostRecentUpdate: { doc: { bunnyData: { stream: { videoId: 'video-old' } } }, updatedAt: '1' },
      }
      render(x)
      expect(onDisableTus).not.toHaveBeenCalled()

      state.documentEvents = {
        mostRecentUpdate: { doc: { bunnyData: { stream: { videoId: 'video-x' } } }, updatedAt: '2' },
      }
      render(x)
      expect(onDisableTus).toHaveBeenCalledOnce()
    })

    it('enables Save only after it writes the uploaded video into the form', async () => {
      state.form = formState(saved)
      await prepare()
      state.pendingAuth[0]!(uploadAuth)
      await flush()
      let pending: (value: unknown[]) => void = () => {}
      state.uploads[0]!.findPreviousUploads.mockImplementationOnce(
        () => new Promise<unknown[]>((resolve) => (pending = resolve)),
      )
      state.setBackgroundProcessing.mockClear()

      state.uploads[0]!.opts.onSuccess()
      expect(state.setBackgroundProcessing).not.toHaveBeenCalledWith(false)

      let videoIdAtEnable: unknown
      state.setBackgroundProcessing.mockImplementation((value: boolean) => {
        if (!value) {
          videoIdAtEnable = state.form['bunnyData.stream.videoId']?.value
        }
      })
      pending([])
      await flush()

      expect(videoIdAtEnable).toBe('video-x')
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

  it('turns background processing off before it marks the form as modified, so the next Save clears the modified state', async () => {
    await prepare()
    state.pendingAuth[0]!(uploadAuth)
    await flush()

    state.uploads[0]!.opts.onSuccess()
    await flush()

    const enabled = state.setBackgroundProcessing.mock.calls.findLastIndex(([value]) => value === false)
    expect(state.setBackgroundProcessing.mock.invocationCallOrder[enabled]).toBeLessThan(
      state.setModified.mock.invocationCallOrder[0]!,
    )
  })

  it('calls onCancel when Cancel runs outside auto mode', async () => {
    await prepare()

    cancel()

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onDisableTus).not.toHaveBeenCalled()
  })

  it('turns TUS mode off instead of calling onCancel when Cancel runs in auto mode', async () => {
    await prepare(true)

    cancel()

    expect(onDisableTus).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
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
