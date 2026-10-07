import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { jsonResponse, spyFetch } from '../../helpers/unit/fetchMock.js'

const state = vi.hoisted(() => ({
  config: {} as { handler: (args: Record<string, unknown>) => Promise<unknown> },
  Handler: () => null,
  t: (key: string, args?: Record<string, unknown>) => `${key} ${JSON.stringify(args)}`,
  toastDismiss: vi.fn(),
  toastError: vi.fn(),
  toastLoading: vi.fn(),
  uploads: [] as { file: File; opts: Record<string, any>; start: ReturnType<typeof vi.fn> }[],
}))

vi.mock('@payloadcms/plugin-cloud-storage/client', () => ({
  createClientUploadHandler: (config: typeof state.config) => {
    state.config = config
    return state.Handler
  },
}))

vi.mock('@payloadcms/ui', () => ({
  toast: { dismiss: state.toastDismiss, error: state.toastError, loading: state.toastLoading },
  useTranslation: () => ({ t: state.t }),
}))

vi.mock('tus-js-client', () => ({
  Upload: class {
    file: File
    opts: Record<string, any>
    start = vi.fn()
    constructor(file: File, opts: Record<string, any>) {
      this.file = file
      this.opts = opts
      state.uploads.push(this as never)
    }
  },
}))

const { BunnyClientUploadHandler } = await import('@/client/ClientUploadHandler.js')
const { TusRenewError } = await import('@/client/TusUpload/tusAuth.js')
const handler = (args: {
  apiRoute?: string
  collectionSlug?: string
  data?: unknown
  file: File
  serverURL?: string
}) => state.config.handler({ ...args, props: { t: state.t } })

const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
const headers = {
  AuthorizationExpire: '1700000000',
  AuthorizationSignature: 'signature',
  LibraryId: '12345',
  VideoId: 'video-guid',
}
const data = {
  errorMessage: "Couldn't upload file: clip.mp4",
  expiresIn: 300,
  headers,
  uploadUrl: 'https://video.bunnycdn.com/tusupload/upload-token',
  videoId: 'video-guid',
  videoToken: 'video-token',
}

beforeEach(() => {
  state.uploads = []
  state.toastDismiss.mockClear()
  state.toastError.mockClear()
  state.toastLoading.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BunnyClientUploadHandler', () => {
  it('sends the file to the upload that the server created, with its TUS headers, and resolves undefined', async () => {
    const result = handler({ data, file })
    const [upload] = state.uploads

    expect(upload!.file).toBe(file)
    expect(upload!.start).toHaveBeenCalledOnce()
    expect(upload!.opts.uploadUrl).toBe('https://video.bunnycdn.com/tusupload/upload-token')
    expect(upload!.opts).not.toHaveProperty('headers')
    expect(upload!.opts).not.toHaveProperty('endpoint')
    expect(upload!.opts).not.toHaveProperty('metadata')
    expect(upload!.opts.storeFingerprintForResuming).toBe(false)
    expect(upload!.opts.retryDelays).toEqual([0, 1000, 3000])
    expect(upload!.opts.onBeforeRequest).toBeTypeOf('function')

    upload!.opts.onSuccess()
    await expect(result).resolves.toBeUndefined()
  })

  it('renews the headers of the same upload through tus-auth with the video token', async () => {
    const calls = spyFetch(() =>
      jsonResponse({
        type: 'upload',
        expiresIn: 300,
        headers: { ...headers, AuthorizationSignature: 'renewed' },
        uploadUrl: data.uploadUrl,
      }),
    )
    void handler({
      apiRoute: '/api',
      collectionSlug: 'media',
      data: { ...data, expiresIn: 30 },
      file,
      serverURL: 'https://cms.test',
    })
    const setHeader = vi.fn()

    await state.uploads[0]!.opts.onBeforeRequest({ setHeader })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://cms.test/api/storage-bunny/stream/tus-auth')
    expect(calls[0]!.body).toEqual({
      collection: 'media',
      filename: 'clip.mp4',
      filesize: file.size,
      filetype: 'video/mp4',
      renew: true,
      videoId: 'video-guid',
      videoToken: 'video-token',
    })
    expect(setHeader).toHaveBeenCalledWith('AuthorizationSignature', 'renewed')
  })

  it('resolves when the renewal finds that the upload has already finished', async () => {
    const result = handler({ data, file })
    const finished = { type: 'uploaded', libraryId: 1, title: 'clip', videoId: 'video-guid', videoToken: 'video-token' }

    state.uploads[0]!.opts.onError(
      Object.assign(new Error('tus'), { causingError: new TusRenewError({ ...finished, requestedAt: 0 } as never) }),
    )

    await expect(result).resolves.toBeUndefined()
    expect(state.toastError).not.toHaveBeenCalled()
  })

  it('does not retry a failed renewal', () => {
    void handler({ data, file })

    expect(
      state.uploads[0]!.opts.onShouldRetry(Object.assign(new Error('tus'), { causingError: new TusRenewError() })),
    ).toBe(false)
  })

  it('shows the upload progress and hides it when the upload ends', async () => {
    const result = handler({ data, file })
    const { opts } = state.uploads[0]!

    opts.onProgress(50, 200)
    expect(state.toastLoading).toHaveBeenLastCalledWith('clip.mp4: 25%', { id: 'bunny-upload-video-guid' })
    expect(state.toastDismiss).not.toHaveBeenCalled()

    opts.onSuccess()
    await result
    expect(state.toastDismiss).toHaveBeenCalledWith('bunny-upload-video-guid')
    expect(state.toastError).not.toHaveBeenCalled()
  })

  it('rejects with the short message from the server, logs the TUS error and turns the progress into an error toast', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = handler({ data, file })
    const error = new Error('tus: failed to upload chunk at offset 0, caused by [object ProgressEvent]')

    state.uploads[0]!.opts.onError(error)

    await expect(result).rejects.toThrow(new Error("Couldn't upload file: clip.mp4"))
    await expect(result).rejects.toHaveProperty('cause', error)
    expect(consoleError).toHaveBeenCalledWith(error)
    expect(state.toastError).toHaveBeenCalledExactlyOnceWith("Couldn't upload file: clip.mp4", {
      id: 'bunny-upload-video-guid',
    })
    expect(state.toastDismiss).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('throws the translated upload error, shows it in a toast and starts no upload when the server sends no upload data', async () => {
    const message = '@seshuk/payload-storage-bunny:errorUploadFileFailed {"filename":"clip.mp4"}'

    await expect(handler({ data: undefined, file })).rejects.toThrow(message)
    expect(state.toastError).toHaveBeenCalledExactlyOnceWith(message)
    expect(state.uploads).toHaveLength(0)
  })

  it('renders the upload handler with the admin translation function', () => {
    const element = BunnyClientUploadHandler({ children: null, collectionSlug: 'media' } as never)

    expect(element.type).toBe(state.Handler)
    expect(element.props).toMatchObject({ collectionSlug: 'media', props: { t: state.t } })
  })
})
