import { describe, expect, it, vi } from 'vitest'

const httpFetch = vi.hoisted(() => vi.fn())

vi.mock('@/server/http/index.js', () => ({ httpFetch }))

const { bunnyFetch, REQUEST_TIMEOUT_MS } = await import('@/cli/lib/bunnyApi.js')

describe('bunnyFetch', () => {
  it('times out the request to Bunny after REQUEST_TIMEOUT_MS', async () => {
    httpFetch.mockResolvedValue(new Response('{}'))

    await bunnyFetch('account-key', '/pullzone')

    expect(httpFetch).toHaveBeenCalledWith(
      'https://api.bunny.net/pullzone',
      expect.objectContaining({ timeout: REQUEST_TIMEOUT_MS }),
    )
    expect(REQUEST_TIMEOUT_MS).toBe(30_000)
  })
})
