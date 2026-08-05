import { beforeEach, describe, expect, it, vi } from 'vitest'

import { httpError } from '../../../helpers/unit/httpError.js'

const { callableMock, deleteMock, getMock, postMock } = vi.hoisted(() => ({
  callableMock: vi.fn(),
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
  return { ...actual, default: { create: () => instance } }
})

const { httpFetch, httpJson, httpSend } = await import('@/server/http/client.js')

beforeEach(() => {
  callableMock.mockReset()
  deleteMock.mockReset()
  getMock.mockReset()
  postMock.mockReset()
})

describe('httpFetch', () => {
  it('GETs by default and forwards no extra options', async () => {
    const response = new Response('ok')
    getMock.mockResolvedValue(response)

    await expect(httpFetch('https://x.test/a')).resolves.toBe(response)
    expect(getMock).toHaveBeenCalledWith('https://x.test/a', {})
  })

  it('dispatches by method and forwards json/headers/timeout/signal/searchParams', async () => {
    postMock.mockResolvedValue(new Response(null))
    const signal = AbortSignal.timeout(1000)

    await httpFetch('https://x.test/a', {
      headers: { A: '1' },
      json: { hi: true },
      method: 'post',
      searchParams: { p: 1 },
      signal,
      timeout: 5000,
    })

    expect(postMock).toHaveBeenCalledWith('https://x.test/a', {
      headers: { A: '1' },
      json: { hi: true },
      searchParams: { p: 1 },
      signal,
      timeout: 5000,
    })
  })

  it('honors an explicit retry option', async () => {
    getMock.mockResolvedValue(new Response(null))

    await httpFetch('https://x.test/a', { retry: 3 })

    expect(getMock).toHaveBeenCalledWith('https://x.test/a', { retry: 3 })
  })

  it('marks streaming requests via ky context so the drain hook is skipped', async () => {
    getMock.mockResolvedValue(new Response(null))

    await httpFetch('https://x.test/a', { stream: true })

    expect(getMock).toHaveBeenCalledWith('https://x.test/a', { context: { stream: true } })
  })

  it('routes OPTIONS through the callable instance (ky has no .options method)', async () => {
    callableMock.mockResolvedValue(new Response(null))

    await httpFetch('https://x.test/a', { method: 'options' })

    expect(callableMock).toHaveBeenCalledWith('https://x.test/a', { method: 'OPTIONS' })
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('httpJson', () => {
  it('parses the JSON body', async () => {
    getMock.mockResolvedValue(new Response(JSON.stringify({ value: 42 })))

    await expect(httpJson<{ value: number }>('https://x.test/a')).resolves.toEqual({ value: 42 })
  })

  it('passes errors through unchanged (no wrapping)', async () => {
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
