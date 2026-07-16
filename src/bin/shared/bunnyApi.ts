const BUNNY_API_BASE = 'https://api.bunny.net'

export type BunnyFetchInit = { body?: unknown; method?: string }

export const bunnyFetch = async (accountApiKey: string, path: string, init: BunnyFetchInit = {}): Promise<Response> => {
  const response = await fetch(`${BUNNY_API_BASE}${path}`, {
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers: {
      accept: 'application/json',
      AccessKey: accountApiKey,
      'content-type': 'application/json',
    },
    method: init.method ?? 'GET',
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Bunny API ${init.method ?? 'GET'} ${path} failed (${response.status}): ${text}`)
  }

  return response
}

export const bunnyJson = async <T>(accountApiKey: string, path: string, init: BunnyFetchInit = {}): Promise<T> => {
  const response = await bunnyFetch(accountApiKey, path, init)
  const text = await response.text()
  return (text ? JSON.parse(text) : {}) as T
}

export const listItems = <T>(payload: unknown): T[] => {
  if (Array.isArray(payload)) {
    return payload as T[]
  }
  const items = (payload as { Items?: T[] } | null | undefined)?.Items
  return items ?? []
}

export const hostnameOf = (pullZone: { Hostnames?: Array<{ Value?: string }>; Name?: string }): string => {
  const fromList = pullZone.Hostnames?.find((entry) => typeof entry.Value === 'string')?.Value
  return fromList ?? `${pullZone.Name ?? ''}.b-cdn.net`
}

export const maskKey = (key: string): string => (key.length <= 4 ? '…' : `…${key.slice(-4)}`)
