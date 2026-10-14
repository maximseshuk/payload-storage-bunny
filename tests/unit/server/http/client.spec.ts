import { beforeEach, describe, expect, it, vi } from 'vitest'

import { httpError } from '../../../helpers/unit/httpError.js'

const { callableMock, createMock, deleteMock, getMock, postMock } = vi.hoisted(() => ({
  callableMock: vi.fn(),
  createMock: vi.fn(),
  deleteMock: vi.fn(),
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock('ky', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ky')>()
  const instance = Object.assign(callableMock, {
    delete: deleteMock,
    get: getMock,
    head: vi.fn(),
    patch: vi.fn(),
    post: postMock,
    put: vi.fn(),
  })
  return { ...actual, default: { create: createMock.mockReturnValue(instance) } }
})

const { httpFetch, httpJson, httpSend } = await import('@/server/http/client.js')

beforeEach(() => {
  callableMock.mockReset()
  deleteMock.mockReset()
  getMock.mockReset()
  postMock.mockReset()
})

describe('httpFetch', () => {
  const signal = AbortSignal.timeout(1000)

  it.each([
    ['uses GET by default and forwards no extra options', undefined, 'get', {}],
    [
      'calls the given method and forwards json, headers, timeout, signal and searchParams',
      {
        headers: { A: '1' },
        json: { hi: true },
        method: 'post',
        searchParams: { p: 1 },
        signal,
        timeout: 5000,
      },
      'post',
      { headers: { A: '1' }, json: { hi: true }, searchParams: { p: 1 }, signal, timeout: 5000 },
    ],
    ['uses an explicit retry option', { retry: 3 }, 'get', { retry: 3 }],
    [
      'marks streaming requests in the ky context so the drain hook skips them',
      { stream: true },
      'get',
      { context: { stream: true } },
    ],
  ] as const)('%s', async (_title, options, method, expected) => {
    const response = new Response('ok')
    const mock = method === 'post' ? postMock : getMock
    mock.mockResolvedValue(response)

    await expect(httpFetch('https://x.test/a', options as never)).resolves.toBe(response)
    expect(mock).toHaveBeenCalledWith('https://x.test/a', expected)
  })

  it('routes OPTIONS through the callable instance (ky has no .options method)', async () => {
    callableMock.mockResolvedValue(new Response(null))

    await httpFetch('https://x.test/a', { method: 'options' })

    expect(callableMock).toHaveBeenCalledWith('https://x.test/a', { method: 'OPTIONS' })
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('response drain hook', () => {
  const [drain] = createMock.mock.calls[0][0].hooks.afterResponse

  it('drains the body of a non-streaming response and ignores a body that fails mid-read', async () => {
    const body = Promise.reject(new Error('socket hang up'))
    const catchSpy = vi.spyOn(body, 'catch')
    const blob = vi.fn(() => body)

    drain({ options: { context: {} }, response: { blob } })
    await Promise.resolve()

    expect(blob).toHaveBeenCalledTimes(1)
    expect(catchSpy).toHaveBeenCalledTimes(1)
  })

  it('leaves a streaming response untouched', () => {
    const blob = vi.fn()

    drain({ options: { context: { stream: true } }, response: { blob } })

    expect(blob).not.toHaveBeenCalled()
  })
})

describe('httpJson', () => {
  it('parses the JSON body', async () => {
    getMock.mockResolvedValue(new Response(JSON.stringify({ value: 42 })))

    await expect(httpJson<{ value: number }>('https://x.test/a')).resolves.toEqual({ value: 42 })
  })

  it('passes errors through without wrapping', async () => {
    const err = httpError(404)
    getMock.mockRejectedValue(err)

    await expect(httpJson('https://x.test/a')).rejects.toBe(err)
  })
})

describe('httpSend', () => {
  it('resolves to void and ignores the response', async () => {
    postMock.mockResolvedValue(new Response('body'))

    await expect(httpSend('https://x.test/a', { method: 'post' })).resolves.toBeUndefined()
    expect(postMock).toHaveBeenCalledTimes(1)
  })
})
