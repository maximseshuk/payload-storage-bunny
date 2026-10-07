'use client'

import { useConfig } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import { useCallback, useMemo, useSyncExternalStore } from 'react'

import { PLAYER_ATTEMPTS, READY_TIMEOUT } from '@/client/StreamPreview/watchPlayerReady.js'
import { watchStreamStatus } from '@/client/StreamPreview/watchStreamStatus.js'
import type { StreamStatusResponse, StreamVideoState } from '@/shared/types/index.js'

export type StreamStatusSnapshot = {
  checking: boolean
  error: boolean
  playerPending?: boolean
  resolutions?: StreamStatusResponse['resolutions']
  state: 'error' | 'loading' | 'stale' | StreamVideoState
  checked?: boolean
}

type Entry = {
  initialStatus: null | StreamVideoState | undefined
  listeners: Set<() => void>
  playerTimer?: ReturnType<typeof setTimeout>
  snapshot: StreamStatusSnapshot
  stop?: () => void
  url: string
}

const entries = new Map<string, Entry>()

const update = (entry: Entry, patch: Partial<StreamStatusSnapshot>) => {
  entry.snapshot = { ...entry.snapshot, ...patch }
  for (const listener of entry.listeners) {
    listener()
  }
}

const releasePlayer = (entry: Entry) => {
  clearTimeout(entry.playerTimer)
  entry.playerTimer = undefined
  if (entry.snapshot.playerPending) {
    update(entry, { playerPending: false })
  }
}

const watch = (entry: Entry) =>
  watchStreamStatus(
    entry.url,
    (state) => {
      update(entry, state === 'error' ? { error: true, state } : { state })
      if (state === 'ready' && entry.snapshot.playerPending && !entry.playerTimer) {
        entry.playerTimer = setTimeout(() => releasePlayer(entry), READY_TIMEOUT * PLAYER_ATTEMPTS)
      }
    },
    (response) => {
      if (response) {
        update(entry, {
          checking: false,
          error: false,
          resolutions: response.resolutions ?? entry.snapshot.resolutions,
          ...(entry.snapshot.checking && { checked: true }),
        })
      } else if (entry.snapshot.checking) {
        update(entry, { checking: false, error: true })
      }
    },
  )

export const getStreamStatus = (key: string): StreamStatusSnapshot | undefined => entries.get(key)?.snapshot

export const subscribeStreamStatus = (
  key: string,
  url: string,
  initialStatus: null | StreamVideoState | undefined,
  listener: () => void,
): (() => void) => {
  let entry = entries.get(key)
  if (!entry) {
    entry = {
      initialStatus,
      listeners: new Set(),
      snapshot: { checking: false, error: false, state: initialStatus ?? 'loading' },
      url,
    }
    entries.set(key, entry)
    if (initialStatus !== 'failed' && initialStatus !== 'ready') {
      entry.stop = watch(entry)
    }
  }
  const current = entry
  current.listeners.add(listener)
  return () => {
    current.listeners.delete(listener)
    if (current.listeners.size === 0) {
      current.stop?.()
      releasePlayer(current)
      entries.delete(key)
    }
  }
}

export const refreshStreamStatus = (key: string): void => {
  const entry = entries.get(key)
  if (!entry || entry.snapshot.checking) {
    return
  }
  entry.stop?.()
  update(entry, { checked: false, checking: true, error: false })
  entry.stop = watch(entry)
}

export const registerPlayer = (key: string): (() => void) => {
  const entry = entries.get(key)
  if (!entry || entry.initialStatus !== 'processing' || entry.snapshot.state === 'ready') {
    return () => {}
  }
  update(entry, { playerPending: true })
  return () => releasePlayer(entry)
}

export const markPlayerReady = (key: string): void => {
  const entry = entries.get(key)
  if (entry) {
    releasePlayer(entry)
  }
}

export const getStreamStatusUrl = (
  apiRoute: string,
  serverURL: string | undefined,
  collection: string,
  id: number | string,
  videoId: string,
): string =>
  formatAdminURL({
    apiRoute,
    path: `/storage-bunny/stream/status/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/${encodeURIComponent(videoId)}`,
    serverURL,
  })

export const useStreamStatus = ({
  id,
  collection,
  initialStatus,
  videoId,
}: {
  collection?: string
  id?: number | string
  initialStatus?: null | StreamVideoState
  videoId?: string
}): { key: string; refresh: () => void } & StreamStatusSnapshot => {
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()
  const key = collection && id !== undefined ? `${collection}:${id}:${videoId ?? ''}` : ''
  const fallback = useMemo<StreamStatusSnapshot>(
    () => ({ checking: false, error: false, state: initialStatus ?? 'loading' }),
    [initialStatus],
  )
  const subscribe = useCallback(
    (listener: () => void) =>
      key && collection && id !== undefined && videoId
        ? subscribeStreamStatus(
            key,
            getStreamStatusUrl(api, serverURL, collection, id, videoId),
            initialStatus,
            listener,
          )
        : () => {},
    [api, collection, id, initialStatus, key, serverURL, videoId],
  )
  const getSnapshot = useCallback(() => entries.get(key)?.snapshot ?? fallback, [fallback, key])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const refresh = useCallback(() => refreshStreamStatus(key), [key])

  return { ...snapshot, key, refresh }
}
