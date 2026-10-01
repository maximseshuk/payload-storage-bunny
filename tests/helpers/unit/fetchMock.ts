import { vi } from 'vitest'

export type FetchCall = { body?: Record<string, unknown>; method: string; pathname: string; url: string }

export const jsonResponse = (value: unknown): Response => new Response(JSON.stringify(value), { status: 200 })

export const spyFetch = (respond: (call: FetchCall) => Response): FetchCall[] => {
  const calls: FetchCall[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : undefined
    const url = request ? request.url : String(input)
    const rawBody = request ? await request.text() : (init?.body as string | undefined)
    const call: FetchCall = {
      body: rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : undefined,
      method: request ? request.method : (init?.method ?? 'GET'),
      pathname: new URL(url).pathname,
      url,
    }
    calls.push(call)
    return respond(call)
  })
  return calls
}
