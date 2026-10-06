import type { StreamStatusResponse, StreamVideoState } from '@/shared/types/index.js'

const POLL_DELAYS = [5000, 10000, 20000, 30000]
const POLL_LIMIT = 30 * 60 * 1000
const MAX_ERRORS = 3
const REQUEST_TIMEOUT = 15000
const STATES: unknown[] = ['failed', 'processing', 'ready']

export const watchStreamStatus = (
  url: string,
  onState: (state: 'error' | 'stale' | StreamVideoState) => void,
  onCheck?: (response?: StreamStatusResponse) => void,
): (() => void) => {
  const controller = new AbortController()
  const startedAt = Date.now()
  let attempt = 0
  let errors = 0
  let due = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const schedule = () => {
    if (controller.signal.aborted) {
      return
    }
    if (Date.now() - startedAt >= POLL_LIMIT) {
      onState('stale')
      return
    }
    const delay = POLL_DELAYS[Math.min(attempt, POLL_DELAYS.length - 1)]
    attempt += 1
    timer = setTimeout(() => {
      if (document.hidden) {
        due = true
      } else {
        void load()
      }
    }, delay)
  }

  const load = async () => {
    const request = new AbortController()
    const abort = () => request.abort()
    const timeout = setTimeout(abort, REQUEST_TIMEOUT)
    controller.signal.addEventListener('abort', abort)
    try {
      const response = await fetch(url, { credentials: 'include', signal: request.signal })
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        onCheck?.()
        onState('error')
        return
      }
      if (!response.ok) {
        throw new Error(`Status request failed: ${response.status}`)
      }
      const body = (await response.json()) as StreamStatusResponse
      const next = body.state
      if (!STATES.includes(next)) {
        throw new Error(`Unknown video state: ${String(next)}`)
      }
      errors = 0
      onCheck?.(body)
      onState(next)
      if (next === 'processing') {
        schedule()
      }
    } catch {
      if (controller.signal.aborted) {
        return
      }
      errors += 1
      onCheck?.()
      if (errors >= MAX_ERRORS) {
        onState('error')
      }
      schedule()
    } finally {
      clearTimeout(timeout)
      controller.signal.removeEventListener('abort', abort)
    }
  }

  const onVisibilityChange = () => {
    if (due && !document.hidden) {
      due = false
      void load()
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  if (document.hidden) {
    due = true
  } else {
    void load()
  }

  return () => {
    controller.abort()
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
