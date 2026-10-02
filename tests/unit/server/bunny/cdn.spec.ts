import { beforeEach, describe, expect, it, vi } from 'vitest'

import { httpError } from '../../../helpers/unit/httpError.js'

const { kyMethods, mockKy } = await vi.hoisted(() => import('../../../helpers/unit/kyMock.js'))
vi.mock('ky', mockKy)

const { post: postMock } = kyMethods

const { purgeCache } = await import('@/server/bunny/cdn.js')

beforeEach(() => {
  postMock.mockReset()
})

describe('purgeCache', () => {
  it('sends a POST to the purge endpoint with AccessKey, searchParams and the default timeout', async () => {
    postMock.mockResolvedValue(undefined)

    await purgeCache({ apiKey: 'key-123', url: 'https://cdn.example.com/x.jpg' })

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith('https://api.bunny.net/purge', {
      headers: { AccessKey: 'key-123' },
      searchParams: { async: false, url: 'https://cdn.example.com/x.jpg' },
      timeout: 15000,
    })
  })

  it('passes async=true through to searchParams', async () => {
    postMock.mockResolvedValue(undefined)

    await purgeCache({ apiKey: 'key-123', async: true, url: 'https://cdn.example.com/x.jpg' })

    expect(postMock.mock.calls[0][1]).toMatchObject({
      searchParams: { async: true, url: 'https://cdn.example.com/x.jpg' },
    })
  })

  it('throws before calling the API when apiKey is missing', async () => {
    await expect(purgeCache({ apiKey: '', url: 'https://cdn.example.com/x.jpg' })).rejects.toThrow(
      'API key is required for cache purging',
    )
    expect(postMock).not.toHaveBeenCalled()
  })

  it('maps a 401 HTTPError to an invalid API key message', async () => {
    postMock.mockRejectedValue(httpError(401))

    await expect(purgeCache({ apiKey: 'key', url: 'https://cdn.example.com/x.jpg' })).rejects.toThrow(
      'Bunny.net: Invalid API key',
    )
  })

  it('maps a 500 HTTPError to a server error message', async () => {
    postMock.mockRejectedValue(httpError(500))

    await expect(purgeCache({ apiKey: 'key', url: 'https://cdn.example.com/x.jpg' })).rejects.toThrow(
      'Bunny.net: Server error',
    )
  })

  it('falls back to the generic message for other HTTPError statuses', async () => {
    postMock.mockRejectedValue(httpError(404))

    await expect(purgeCache({ apiKey: 'key', url: 'https://cdn.example.com/x.jpg' })).rejects.toThrow(
      'Unable to purge cache: https://cdn.example.com/x.jpg',
    )
  })
})
