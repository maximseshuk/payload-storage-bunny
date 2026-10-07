import { beforeEach, describe, expect, it, vi } from 'vitest'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('ky', () => ({ default: { post: postMock } }))

const { getFinishedTusUpload, getTusAuthUrl, isLostTusUpload, renewTusHeaders, shouldRetryTusRequest, TusRenewError } =
  await import('@/client/TusUpload/tusAuth.js')
const tus = await import('tus-js-client')

const NOW = 1_700_000_000_000
const uploadUrl = 'https://video.bunnycdn.com/tusupload/upload-1'
const body = {
  collection: 'media',
  filename: 'clip.mp4',
  filesize: 10,
  filetype: 'video/mp4',
  videoId: 'v-1',
  videoToken: 't',
}
const tusHeaders = (signature = 'old') => ({
  AuthorizationExpire: '9999999999',
  AuthorizationSignature: signature,
  LibraryId: '1',
  VideoId: 'v-1',
})
const authValidFor = (seconds: number, signature = 'old') => ({
  expiresIn: 300,
  headers: tusHeaders(signature),
  requestedAt: NOW - (300 - seconds) * 1000,
  uploadUrl,
})
const respond = (auth: Record<string, unknown>) => postMock.mockReturnValue({ json: async () => auth })

describe('renewTusHeaders', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW })
    postMock.mockReset()
    return () => vi.useRealTimers()
  })

  it('sets the current headers without calling the server while they are valid for more than a minute', async () => {
    const setHeader = vi.fn()
    await renewTusHeaders({ auth: authValidFor(120), body, url: '/tus-auth' })({ setHeader } as never)

    expect(postMock).not.toHaveBeenCalled()
    expect(setHeader).toHaveBeenCalledWith('AuthorizationSignature', 'old')
  })

  it('counts the lifetime from now when the request time is unknown', async () => {
    const setHeader = vi.fn()
    const { requestedAt: _requestedAt, ...auth } = authValidFor(0)

    await renewTusHeaders({ auth, body, url: '/tus-auth' })({ setHeader } as never)

    expect(postMock).not.toHaveBeenCalled()
  })

  it('asks the server in renew mode for new headers of the same upload, then keeps them until they near expiry', async () => {
    respond({ type: 'upload', expiresIn: 300, headers: tusHeaders('new'), uploadUrl })
    const onBeforeRequest = renewTusHeaders({ auth: authValidFor(30), body, url: '/tus-auth' })
    const setHeader = vi.fn()

    await onBeforeRequest({ setHeader } as never)
    await onBeforeRequest({ setHeader } as never)
    expect(postMock).toHaveBeenCalledExactlyOnceWith('/tus-auth', { json: { ...body, renew: true } })
    expect(setHeader).toHaveBeenCalledTimes(8)
    expect(setHeader).not.toHaveBeenCalledWith('AuthorizationSignature', 'old')

    vi.advanceTimersByTime(241_000)
    await onBeforeRequest({ setHeader } as never)
    expect(postMock).toHaveBeenCalledTimes(2)
  })

  it('throws a renewal error when the server answers with another upload', async () => {
    respond({ type: 'upload', expiresIn: 300, headers: tusHeaders(), uploadUrl: 'x' })
    const onBeforeRequest = renewTusHeaders({ auth: authValidFor(0), body, url: '/tus-auth' })

    const err = await onBeforeRequest({ setHeader: vi.fn() } as never).catch((error: unknown) => error)

    expect(err).toBeInstanceOf(TusRenewError)
    expect(err).toMatchObject({ message: 'tus: the server did not renew the authorization of this upload' })
    expect((err as InstanceType<typeof TusRenewError>).uploaded).toBeUndefined()
  })
})

describe('tus upload with a failed renewal', () => {
  beforeEach(() => {
    postMock.mockReset()
  })

  const runUpload = (auth: ReturnType<typeof authValidFor>) =>
    new Promise<{ err: Error; requests: string[] }>((resolve, reject) => {
      const requests: string[] = []
      new tus.Upload(Buffer.from('0123456789'), {
        httpStack: {
          createRequest: (method: string, url: string) => ({
            abort: () => Promise.resolve(),
            getHeader: () => undefined,
            getMethod: () => method,
            getURL: () => url,
            getUnderlyingObject: () => null,
            send: () => {
              requests.push(`${method} ${url}`)
              return Promise.reject(new Error('the request must not be sent'))
            },
            setHeader: () => {},
            setProgressHandler: () => {},
          }),
          getName: () => 'test',
        },
        onBeforeRequest: renewTusHeaders({ auth, body, url: '/tus-auth' }),
        onError: (err) => resolve({ err, requests }),
        onShouldRetry: shouldRetryTusRequest,
        onSuccess: () => reject(new Error('the upload must not succeed')),
        retryDelays: [0, 0, 0],
        uploadUrl,
      }).start()
    })

  it('does not retry when the server refuses to renew, and reports the upload as lost', async () => {
    postMock.mockReturnValue({ json: () => Promise.reject(new Error('HTTP 409')) })

    const { err, requests } = await runUpload(authValidFor(0))

    expect(postMock).toHaveBeenCalledOnce()
    expect(requests).toEqual([])
    expect(isLostTusUpload(err)).toBe(true)
    expect(getFinishedTusUpload(err)).toBeUndefined()
  })

  it('stops without retrying and hands over the finished upload when the server answers uploaded', async () => {
    respond({ type: 'uploaded', libraryId: 1, title: 'clip', videoId: 'v-1', videoToken: 't' })

    const { err } = await runUpload(authValidFor(0))

    expect(postMock).toHaveBeenCalledOnce()
    expect(getFinishedTusUpload(err)).toMatchObject({ type: 'uploaded', videoId: 'v-1' })
    expect(isLostTusUpload(err)).toBe(false)
  })
})

describe('getTusAuthUrl', () => {
  it('builds the tus-auth URL from the server URL and the API route', () => {
    expect(getTusAuthUrl('https://cms.test', '/api')).toBe('https://cms.test/api/storage-bunny/stream/tus-auth')
  })
})

describe('tus request errors', () => {
  const failure = (status?: number) =>
    Object.assign(new Error('tus'), {
      originalResponse: status === undefined ? null : { getStatus: () => status },
    }) as never

  it('retries network errors, server errors and conflicts, but not a lost upload or other client errors', () => {
    expect([undefined, 500, 503, 409, 423].map((status) => shouldRetryTusRequest(failure(status)))).toEqual([
      true,
      true,
      true,
      true,
      true,
    ])
    expect([400, 401, 404, 413].map((status) => shouldRetryTusRequest(failure(status)))).toEqual([
      false,
      false,
      false,
      false,
    ])
  })

  it('treats only a 404 as an upload that Bunny no longer knows', () => {
    expect(isLostTusUpload(failure(404))).toBe(true)
    expect(isLostTusUpload(failure(410))).toBe(false)
    expect(isLostTusUpload(new Error('tus: network'))).toBe(false)
  })
})
