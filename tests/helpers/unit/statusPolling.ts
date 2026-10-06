import { vi } from 'vitest'

export const stubStatusPolling = (fetchImpl: (url: string, init: RequestInit) => unknown) => {
  vi.useFakeTimers()
  const doc = Object.assign(new EventTarget(), { hidden: false })
  const fetchMock = vi.fn(fetchImpl)
  vi.stubGlobal('document', doc)
  vi.stubGlobal('fetch', fetchMock)
  return { doc, fetchMock }
}
