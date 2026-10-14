import { createRequire } from 'node:module'

import { act, fireEvent, render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FileManager } from '@/client/TusUpload/FileManager/FileManager.js'
import { findPreviousTusUploads } from '@/client/TusUpload/FileManager/FileManager.utils.js'
import { TusRenewError } from '@/client/TusUpload/tusAuth.js'

const state = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  const store = {
    backgroundProcessing: false,
    documentEvents: {} as Record<string, unknown>,
    form: {} as Record<string, any>,
  }
  return {
    dispatchFields: vi.fn(),
    drafts: undefined as undefined | { autosave: boolean },
    pendingAuth: [] as ((value: unknown) => void)[],
    pendingPrevious: [] as ((value: unknown) => void)[],
    set: (patch: Partial<typeof store>) => {
      Object.assign(store, patch)
      for (const listener of listeners) {
        listener()
      }
    },
    setBackgroundProcessing: vi.fn(),
    setModified: vi.fn(),
    store,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    toastError: vi.fn(),
    uploads: [] as {
      abort: ReturnType<typeof vi.fn>
      findPreviousUploads: ReturnType<typeof vi.fn>
      opts: Record<string, any>
      start: ReturnType<typeof vi.fn>
    }[],
  }
})

vi.mock('@payloadcms/ui', async () => {
  const { createElement: h, useSyncExternalStore } = await import('react')
  const useStore = <T>(select: () => T) => useSyncExternalStore(state.subscribe, select)
  return {
    Button: ({ children, onClick, tooltip }: { children?: string; onClick: () => void; tooltip?: string }) =>
      h('button', { 'aria-label': tooltip, onClick, type: 'button' }, children),
    Dropzone: ({ children }: { children: ReactNode }) => h('div', null, children),
    ErrorIcon: () => null,
    Spinner: () => null,
    SuccessIcon: () => null,
    TextInput: ({ label, readOnly, value }: { label: string; readOnly: boolean; value: string }) =>
      h('input', { 'aria-label': label, readOnly, value }),
    toast: { error: state.toastError },
    useConfig: () => ({
      config: { routes: { api: '/api' }, serverURL: '' },
      getEntityConfig: () => ({
        admin: { custom: { '@seshuk/payload-storage-bunny': { stream: { mimeTypes: ['video/*'] } } } },
        versions: state.drafts ? { drafts: state.drafts } : false,
      }),
    }),
    useDocumentEvents: () => useStore(() => state.store.documentEvents),
    useForm: () => ({
      dispatchFields: state.dispatchFields,
      getFields: () => state.store.form,
      setBackgroundProcessing: state.setBackgroundProcessing,
      setModified: state.setModified,
    }),
    useFormBackgroundProcessing: () => useStore(() => state.store.backgroundProcessing),
    useFormFields: (selector: (context: unknown) => unknown) =>
      useStore(() => selector([state.store.form, state.dispatchFields])),
    useTranslation: () => ({ t: (key: string) => key }),
  }
})

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

vi.mock('@payloadcms/ui/elements/FileManager/FilePreview/VideoPreview', async () => {
  const { createElement: h } = await import('react')
  return { VideoPreview: ({ fileSrc }: { fileSrc: string }) => h('video', { src: fileSrc }) }
})
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

const mount = (preSelectedFile: File | null, isAutoMode = false) => {
  const manager = (file: File | null) =>
    createElement(FileManager, { collectionSlug: 'media', isAutoMode, onCancel, onDisableTus, preSelectedFile: file })
  const view = render(manager(preSelectedFile))
  return { select: (file: File | null) => view.rerender(manager(file)), unmount: view.unmount }
}

const selectedFile = () => document.querySelector('video')?.getAttribute('src')?.replace('blob:', '') ?? null
const uploadStatus = () => document.querySelector('.file-manager')!.className.split('--').at(-1)
const fileName = () => screen.getByLabelText<HTMLInputElement>('upload:fileName').value
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))
const resolveAuth = async (index: number, value: unknown) => {
  state.pendingAuth[index]!(value)
  await flush()
}
const run = (callback: () => unknown) => act(() => void callback())
const startUpload = () =>
  fireEvent.click(screen.getByRole('button', { name: '@seshuk/payload-storage-bunny:tusUploadStartUpload' }))
const cancel = () => fireEvent.click(screen.getByRole('button', { name: 'general:cancel' }))
const dispatch = (action: Record<string, unknown>) => act(() => state.dispatchFields(action))
const uploadAuth = {
  expiresIn: 300,
  headers: { AuthorizationExpire: '1', AuthorizationSignature: 'signature', LibraryId: '1', VideoId: 'video-x' },
  libraryId: 1,
  type: 'upload',
  uploadUrl: 'https://video.bunnycdn.com/tusupload/upload-x',
  videoId: 'video-x',
  videoToken: 'token',
}
const formValues = () =>
  Object.fromEntries(Object.entries(state.store.form).map(([path, field]) => [path, field.value]))
const formState = (values: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(values).map(([path, value]) => [path, { initialValue: value, value }]))

beforeEach(() => {
  state.drafts = undefined
  state.store.backgroundProcessing = false
  state.store.documentEvents = {}
  state.store.form = {}
  state.setBackgroundProcessing.mockReset()
  state.setBackgroundProcessing.mockImplementation((value: boolean) => state.set({ backgroundProcessing: value }))
  state.uploads = []
  state.pendingAuth = []
  state.pendingPrevious = []
  state.setModified.mockClear()
  state.dispatchFields.mockClear()
  state.dispatchFields.mockImplementation((action) => state.set({ form: fieldReducer(state.store.form, action) }))
  state.toastError.mockClear()
  onCancel.mockClear()
  onDisableTus.mockClear()
  vi.mocked(findPreviousTusUploads).mockImplementation(async () => [])
  vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => `blob:${(file as File).name}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
  vi.mocked(URL.createObjectURL).mockRestore()
  vi.mocked(URL.revokeObjectURL).mockRestore()
})

describe('TUS FileManager pre-selected file', () => {
  const first = new File(['first'], 'first.mp4', { type: 'video/mp4' })

  it('replaces the selected file with a new pre-selected file but not with an earlier one', async () => {
    const second = new File(['second'], 'second.mp4', { type: 'video/mp4' })
    const { select } = mount(first)
    expect(selectedFile()).toBe('first.mp4')

    select(second)
    expect(selectedFile()).toBe('second.mp4')
    expect(state.toastError).not.toHaveBeenCalled()

    select(first)
    expect(selectedFile()).toBe('second.mp4')
    await flush()
  })

  it('keeps the selected file and shows the file type error for a non-Stream pre-selected file', async () => {
    const { select } = mount(first)
    select(new File(['image'], 'photo.jpg', { type: 'image/jpeg' }))

    expect(selectedFile()).toBe('first.mp4')
    expect(state.toastError).toHaveBeenCalledWith('@seshuk/payload-storage-bunny:tusUploadErrorFileType')
    await flush()
  })
})

describe('TUS FileManager when the file changes while the upload starts', () => {
  const x = new File(['x'], 'x.mp4', { type: 'video/mp4' })
  const y = new File(['y'], 'y.mp4', { type: 'video/mp4' })

  const prepare = async (isAutoMode = false) => {
    const view = mount(x, isAutoMode)
    await flush()
    startUpload()
    expect(uploadStatus()).toBe('preparing')
    return view
  }

  const complete = async (isAutoMode = false) => {
    await prepare(isAutoMode)
    await resolveAuth(0, uploadAuth)
    run(() => state.uploads[0]!.opts.onSuccess())
    await flush()
  }

  it.each([false, true])(
    'starts no upload when Cancel runs while tus-auth is pending (auto mode %s)',
    async (isAutoMode) => {
      await prepare(isAutoMode)

      cancel()
      await resolveAuth(0, uploadAuth)

      expect(state.uploads).toHaveLength(0)
      expect(selectedFile()).toBeNull()
      expect(uploadStatus()).toBe('idle')
      expect(formValues()).toEqual({})
    },
  )

  it('starts no upload for the old file when a new file is selected while tus-auth is pending', async () => {
    const { select } = await prepare()

    select(y)
    await flush()
    await resolveAuth(0, uploadAuth)

    expect(state.uploads).toHaveLength(0)
    expect(selectedFile()).toBe('y.mp4')
    expect(uploadStatus()).toBe('idle')
  })

  it('starts no upload after the FileManager unmounts while tus-auth is pending', async () => {
    const { unmount } = await prepare()

    unmount()
    await resolveAuth(0, uploadAuth)

    expect(state.uploads).toHaveLength(0)
    expect(formValues()).toEqual({})
  })

  it('sends the file to the upload that the server created and renews its headers before a request', async () => {
    await prepare()
    await resolveAuth(0, { ...uploadAuth, expiresIn: 30 })
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
    await resolveAuth(0, uploadAuth)
    const lost = Object.assign(new Error('tus: unexpected response'), cause())

    run(() => state.uploads[0]!.opts.onError(lost))
    await flush()
    expect(state.pendingAuth).toHaveLength(2)
    const replacement = {
      ...uploadAuth,
      uploadUrl: `${uploadAuth.uploadUrl}-2`,
      videoId: 'video-y',
      videoToken: 'token-2',
    }
    await resolveAuth(1, replacement)

    expect(state.uploads).toHaveLength(2)
    expect(state.uploads[1]!.opts.uploadUrl).toBe(replacement.uploadUrl)
    expect(state.uploads[1]!.start).toHaveBeenCalled()
    expect(uploadStatus()).toBe('uploading')

    run(() => state.uploads[1]!.opts.onError(lost))
    await flush()
    expect(state.pendingAuth).toHaveLength(2)
    expect(uploadStatus()).toBe('error')
  })

  it('completes the upload when the renewal finds that the upload has already finished', async () => {
    await prepare()
    await resolveAuth(0, uploadAuth)
    const finished = {
      libraryId: 1,
      requestedAt: 0,
      title: 'x',
      type: 'uploaded',
      videoId: 'video-x',
      videoToken: 'token',
    }

    run(() =>
      state.uploads[0]!.opts.onError(
        Object.assign(new Error('tus'), { causingError: new TusRenewError(finished as never) }),
      ),
    )
    await flush()

    expect(state.pendingAuth).toHaveLength(1)
    expect(uploadStatus()).toBe('completed')
    expect(formValues()).toMatchObject({
      'bunnyData.stream.videoId': 'video-x',
      'bunnyData.stream.videoToken': 'token',
    })
  })

  it('ignores the success of an upload whose file is no longer selected', async () => {
    const { select } = await prepare()
    await resolveAuth(0, uploadAuth)
    expect(state.uploads[0]!.start).toHaveBeenCalled()

    select(y)
    expect(state.uploads[0]!.abort).toHaveBeenCalled()
    run(() => state.uploads[0]!.opts.onSuccess())
    await flush()

    expect(formValues()).toEqual({})
    expect(selectedFile()).toBe('y.mp4')
    expect(uploadStatus()).toBe('idle')
  })

  it('aborts the running upload for a new Stream pre-selected file but not for a non-Stream one', async () => {
    const { select } = await prepare()
    await resolveAuth(0, uploadAuth)
    const { abort } = state.uploads[0]!

    select(new File(['image'], 'photo.jpg', { type: 'image/jpeg' }))
    expect(abort).not.toHaveBeenCalled()
    expect(selectedFile()).toBe('x.mp4')
    expect(uploadStatus()).toBe('uploading')

    select(y)
    expect(abort).toHaveBeenCalledOnce()
    await flush()
  })

  it('ignores the previous-upload check of a file that is no longer selected', async () => {
    vi.mocked(findPreviousTusUploads).mockImplementation(
      (file: File) =>
        (file === x ? new Promise((resolve) => state.pendingPrevious.push(resolve)) : Promise.resolve([])) as never,
    )
    const { select } = mount(x)
    select(y)
    await flush()

    state.pendingPrevious[0]!([{ metadata: { title: 'old-x', videoId: 'video-old' } }])
    await flush()

    expect(screen.queryByText('@seshuk/payload-storage-bunny:tusUploadStatusIdleWithRestore')).toBeNull()
    expect(screen.getByText('@seshuk/payload-storage-bunny:tusUploadStatusIdle')).not.toBeNull()
    expect(fileName()).toBe('y.mp4')
    expect(selectedFile()).toBe('y.mp4')
    expect(uploadStatus()).toBe('idle')
    expect(state.pendingAuth).toHaveLength(0)
  })

  it('keeps the form MIME type on select and Cancel and sets it after the upload', async () => {
    state.store.form = formState({ mimeType: 'image/png' })
    const { unmount } = await prepare()
    cancel()
    expect(formValues()).toEqual({ mimeType: 'image/png' })

    unmount()
    await prepare()
    await resolveAuth(1, uploadAuth)
    run(() => state.uploads[0]!.opts.onSuccess())
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
      state.store.form = formState(saved)
      await complete()
    }

    it.each([
      [
        'the uploaded video',
        'reverts the form',
        { ...saved, alt: 'new alt' },
        { 'bunnyData.stream.videoId': 'video-old' },
      ],
      [
        'the uploaded file fields',
        'without a video clears them',
        { alt: 'new alt', filename: null, filesize: null, mimeType: null },
        { filename: null, filesize: null, mimeType: null },
      ],
    ])(
      'puts %s back when a stale autosave answer %s after another field changes',
      async (_fields, _answer, serverState, reverted) => {
        await upload()
        dispatch({ type: 'UPDATE', path: 'alt', value: 'new alt' })
        state.setModified.mockClear()
        const staleAnswer = {
          type: 'MERGE_SERVER_STATE',
          acceptValues: { overrideLocalChanges: false },
          serverState: formState(serverState),
        }
        const staleForm = fieldReducer(state.store.form, staleAnswer as never)
        expect(Object.fromEntries(Object.entries(staleForm).map(([path, field]) => [path, field.value]))).toMatchObject(
          reverted,
        )

        dispatch(staleAnswer)

        expect(formValues()).toEqual(uploaded)
        expect(state.setModified).toHaveBeenLastCalledWith(true)
      },
    )

    it.each([
      ['marks the form as not modified', 'a save without autosave', undefined, [[false]]],
      ['leaves the modified state to autosave', 'an autosave', { autosave: true }, []],
    ])('%s when %s stores the uploaded video', async (_result, _save, drafts, setModifiedCalls) => {
      state.drafts = drafts
      await upload()
      state.setModified.mockClear()

      act(() =>
        state.set({
          documentEvents: {
            mostRecentUpdate: { doc: { bunnyData: { stream: { videoId: 'video-x' } } }, updatedAt: '1' },
          },
        }),
      )

      expect(state.setModified.mock.calls).toEqual(setModifiedCalls)
      expect(onDisableTus).toHaveBeenCalledOnce()
    })

    it('keeps the TUS uploader when a save answers with another video', async () => {
      await upload()

      act(() =>
        state.set({
          documentEvents: {
            mostRecentUpdate: { doc: { bunnyData: { stream: { videoId: 'video-old' } } }, updatedAt: '1' },
          },
        }),
      )
      expect(onDisableTus).not.toHaveBeenCalled()

      act(() =>
        state.set({
          documentEvents: {
            mostRecentUpdate: { doc: { bunnyData: { stream: { videoId: 'video-x' } } }, updatedAt: '2' },
          },
        }),
      )
      expect(onDisableTus).toHaveBeenCalledOnce()
    })

    it('enables Save only after it writes the uploaded video into the form', async () => {
      state.store.form = formState(saved)
      await prepare()
      await resolveAuth(0, uploadAuth)
      let pending: (value: unknown[]) => void = () => {}
      state.uploads[0]!.findPreviousUploads.mockImplementationOnce(
        () => new Promise<unknown[]>((resolve) => (pending = resolve)),
      )
      state.setBackgroundProcessing.mockClear()

      run(() => state.uploads[0]!.opts.onSuccess())
      expect(state.setBackgroundProcessing).not.toHaveBeenCalledWith(false)

      let videoIdAtEnable: unknown
      state.setBackgroundProcessing.mockImplementation((value: boolean) => {
        if (!value) {
          videoIdAtEnable = state.store.form['bunnyData.stream.videoId']?.value
        }
      })
      pending([])
      await flush()

      expect(videoIdAtEnable).toBe('video-x')
    })
  })

  it('turns background processing on again when an autosave turns it off during the upload', async () => {
    await prepare()
    act(() => state.set({ backgroundProcessing: true }))
    state.setBackgroundProcessing.mockClear()

    act(() => state.set({ backgroundProcessing: false }))

    expect(state.setBackgroundProcessing).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('leaves the background processing of an autosave alone when no file is selected', () => {
    mount(null)
    state.setBackgroundProcessing.mockClear()

    act(() => state.set({ backgroundProcessing: true }))

    expect(state.setBackgroundProcessing).not.toHaveBeenCalled()
  })

  it('turns background processing off when the upload is complete', async () => {
    await complete()

    expect(state.setBackgroundProcessing).toHaveBeenLastCalledWith(false)
  })

  it.each([false, true])(
    'puts the previous video back into the form when Cancel runs after the upload (auto mode %s)',
    async (isAutoMode) => {
      const saved = { 'bunnyData.stream.videoId': 'video-old', filename: 'old.webm', mimeType: 'video/webm' }
      state.store.form = formState(saved)
      await complete(isAutoMode)
      expect(formValues()).toMatchObject({ 'bunnyData.stream.videoId': 'video-x' })

      cancel()

      expect(formValues()).toEqual(saved)
      expect(state.store.form).toEqual(formState(saved))
    },
  )

  it('turns background processing off and then marks the form as modified when the upload is complete', async () => {
    await prepare()
    await resolveAuth(0, uploadAuth)
    expect(state.setModified).not.toHaveBeenCalled()

    run(() => state.uploads[0]!.opts.onSuccess())
    await flush()

    expect(state.setModified).toHaveBeenCalledExactlyOnceWith(true)
    const enabled = state.setBackgroundProcessing.mock.calls.findLastIndex(([value]) => value === false)
    expect(state.setBackgroundProcessing.mock.invocationCallOrder[enabled]).toBeLessThan(
      state.setModified.mock.invocationCallOrder[0]!,
    )
  })

  it.each([
    ['calls onCancel', false, onCancel, onDisableTus],
    ['turns TUS mode off instead of calling onCancel', true, onDisableTus, onCancel],
  ])('%s when Cancel runs with auto mode %s', async (_label, isAutoMode, called, skipped) => {
    await prepare(isAutoMode)

    cancel()

    expect(called).toHaveBeenCalledOnce()
    expect(skipped).not.toHaveBeenCalled()
  })

  it('turns background processing off when the FileManager unmounts during the upload', async () => {
    const { unmount } = await prepare(true)
    cancel()
    state.setBackgroundProcessing.mockClear()

    unmount()

    expect(state.setBackgroundProcessing).toHaveBeenCalledExactlyOnceWith(false)
  })
})
