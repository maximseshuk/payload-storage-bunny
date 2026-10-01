import { beforeEach, describe, expect, it, vi } from 'vitest'

import { httpError } from '../../../helpers/unit/httpError.js'

const { httpFetchMock } = vi.hoisted(() => ({ httpFetchMock: vi.fn() }))

vi.mock('@/server/http/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/http/index.js')>()),
  httpFetch: httpFetchMock,
}))

const { bunnyRequest } = await import('@/server/bunny/client.js')

const base = { apiKey: 'key', genericError: 'generic', method: 'get' as const, url: 'https://api.test/x' }

beforeEach(() => {
  httpFetchMock.mockReset()
})

describe('bunnyRequest', () => {
  it('sends AccessKey and Accept and omits undefined options', async () => {
    const response = new Response('ok')
    httpFetchMock.mockResolvedValue(response)

    await expect(bunnyRequest(base)).resolves.toBe(response)
    expect(httpFetchMock).toHaveBeenCalledWith('https://api.test/x', {
      headers: { Accept: 'application/json', AccessKey: 'key' },
      method: 'get',
      timeout: undefined,
    })
  })

  it('drops Accept, adds Content-Type and passes defined options through', async () => {
    httpFetchMock.mockResolvedValue(new Response())
    const body = Buffer.from('x')

    await bunnyRequest({
      ...base,
      accept: false,
      body,
      contentType: 'image/jpeg',
      json: { a: 1 },
      method: 'put',
      searchParams: { page: 1 },
      throwHttpErrors: false,
      timeout: 500,
    })

    expect(httpFetchMock).toHaveBeenCalledWith('https://api.test/x', {
      body,
      headers: { AccessKey: 'key', 'Content-Type': 'image/jpeg' },
      json: { a: 1 },
      method: 'put',
      searchParams: { page: 1 },
      throwHttpErrors: false,
      timeout: 500,
    })
  })

  it('maps a listed HTTP status to its message and keeps the cause', async () => {
    const err = httpError(401)
    httpFetchMock.mockRejectedValue(err)

    await expect(bunnyRequest({ ...base, statusErrors: { 401: 'bad key' } })).rejects.toMatchObject({
      cause: err,
      message: 'bad key',
    })
  })

  it.each([
    ['an unlisted HTTP status', httpError(500)],
    ['a non-HTTP error', new Error('network down')],
  ])('falls back to the generic message for %s', async (_, err) => {
    httpFetchMock.mockRejectedValue(err)

    await expect(bunnyRequest({ ...base, statusErrors: { 401: 'bad key' } })).rejects.toMatchObject({
      cause: err,
      message: 'generic',
    })
  })
})
