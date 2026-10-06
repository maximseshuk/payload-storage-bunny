import { STREAM_EMBED_ORIGIN } from '@/shared/streamEmbed.js'

export const READY_TIMEOUT = 15000
export const PLAYER_ATTEMPTS = 4

const isReadyMessage = (data: unknown): boolean => {
  let message = data
  if (typeof data === 'string') {
    try {
      message = JSON.parse(data)
    } catch {
      return false
    }
  }
  const { context, event } = (message ?? {}) as { context?: unknown; event?: unknown }
  return context === 'player.js' && event === 'ready'
}

export const watchPlayerReady = (
  frame: HTMLIFrameElement,
  onReady: () => void,
  onTimeout: () => void,
): (() => void) => {
  const onMessage = (event: MessageEvent) => {
    if (event.origin === STREAM_EMBED_ORIGIN && event.source === frame.contentWindow && isReadyMessage(event.data)) {
      stop()
      onReady()
    }
  }
  const timer = setTimeout(() => {
    stop()
    onTimeout()
  }, READY_TIMEOUT)
  const stop = () => {
    clearTimeout(timer)
    window.removeEventListener('message', onMessage)
  }

  window.addEventListener('message', onMessage)
  return stop
}
