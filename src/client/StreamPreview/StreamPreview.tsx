'use client'

import { ErrorIcon, Spinner, useTranslation } from '@payloadcms/ui'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'

import { PLAYER_ATTEMPTS, watchPlayerReady } from '@/client/StreamPreview/watchPlayerReady.js'
import { markPlayerReady, registerPlayer, useStreamStatus } from '@/client/StreamStatus/streamStatusStore.js'
import type { PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys } from '@/shared/translations/index.js'
import type { StreamVideoState } from '@/shared/types/index.js'

import './StreamPreview.css'

const BASE_CLASS = 'storage-bunny-stream-preview'
const PLAYER_CLASS = `${BASE_CLASS}__player`

const subscribeNever = () => () => {}

type StreamPreviewProps = {
  allow?: string
  allowFullScreen?: boolean
  collectionSlug?: string
  id?: number | string
  src: string
  status?: null | StreamVideoState
  title?: string
  videoId?: string
}

const StreamPlayer: React.FC<
  { playerKey: string; processing: boolean } & Pick<StreamPreviewProps, 'allow' | 'allowFullScreen' | 'src' | 'title'>
> = ({ allow, allowFullScreen, playerKey, processing, src, title }) => {
  const { t } = useTranslation<PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys>()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [ready, setReady] = useState(false)
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  )

  useEffect(() => {
    const frame = frameRef.current
    if (ready || !frame) {
      return
    }
    const show = () =>
      flushSync(() => {
        setReady(true)
        markPlayerReady(playerKey)
      })
    const stop = watchPlayerReady(frame, show, () =>
      processing && attempt + 1 < PLAYER_ATTEMPTS ? setAttempt(attempt + 1) : show(),
    )
    if (processing) {
      return stop
    }
    frame.addEventListener('load', show)
    return () => {
      stop()
      frame.removeEventListener('load', show)
    }
  }, [attempt, playerKey, processing, ready])

  return (
    <div className={`${BASE_CLASS}__frame`}>
      <iframe
        allow={allow}
        allowFullScreen={allowFullScreen}
        className={PLAYER_CLASS}
        inert={!ready}
        key={attempt}
        loading="eager"
        ref={frameRef}
        src={mounted ? src : undefined}
        title={title || t('@seshuk/payload-storage-bunny:streamPreviewTitle')}
      />
      {!ready && (
        <output className={BASE_CLASS}>
          <Spinner loadingText={null} />
          {processing ? (
            t('@seshuk/payload-storage-bunny:streamPreviewProcessing')
          ) : (
            <span className="sr-only">{t('@seshuk/payload-storage-bunny:streamPreviewLoading')}</span>
          )}
        </output>
      )}
    </div>
  )
}

const StreamPreviewContent: React.FC<{ collectionSlug: string } & StreamPreviewProps> = ({
  id,
  allow,
  allowFullScreen,
  collectionSlug,
  src,
  status,
  title,
  videoId,
}) => {
  const { key, state } = useStreamStatus({ id, collection: collectionSlug, initialStatus: status, videoId })

  useEffect(() => registerPlayer(key), [key])

  const { t } = useTranslation<PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys>()

  if (state === 'ready') {
    return (
      <StreamPlayer
        allow={allow}
        allowFullScreen={allowFullScreen}
        playerKey={key}
        processing={status === 'processing'}
        src={src}
        title={title}
      />
    )
  }

  if (state === 'failed') {
    return (
      <div className={`${BASE_CLASS} ${BASE_CLASS}--danger`} role="alert">
        <ErrorIcon />
        {t('@seshuk/payload-storage-bunny:streamPreviewFailed')}
      </div>
    )
  }

  if (state === 'stale') {
    return <output className={BASE_CLASS}>{t('@seshuk/payload-storage-bunny:streamPreviewStillProcessing')}</output>
  }

  if (state === 'processing') {
    return (
      <output className={BASE_CLASS}>
        <Spinner loadingText={null} />
        {t('@seshuk/payload-storage-bunny:streamPreviewProcessing')}
      </output>
    )
  }

  if (state === 'error') {
    return (
      <output className={BASE_CLASS}>
        <Spinner loadingText={null} />
        {t('@seshuk/payload-storage-bunny:streamPreviewStatusError')}
      </output>
    )
  }

  return (
    <output aria-busy="true" className={BASE_CLASS}>
      <Spinner loadingText={null} />
      <span className="sr-only">{t('@seshuk/payload-storage-bunny:streamPreviewLoading')}</span>
    </output>
  )
}

export const StreamPreview: React.FC<StreamPreviewProps> = ({ id, collectionSlug, ...props }) => {
  const { t } = useTranslation<PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys>()

  return collectionSlug ? (
    <StreamPreviewContent
      key={`${collectionSlug}:${id ?? ''}:${props.videoId ?? ''}`}
      id={id}
      collectionSlug={collectionSlug}
      {...props}
    />
  ) : (
    <iframe
      allow={props.allow}
      allowFullScreen={props.allowFullScreen}
      className={PLAYER_CLASS}
      loading="lazy"
      src={props.src}
      title={props.title || t('@seshuk/payload-storage-bunny:streamPreviewTitle')}
    />
  )
}
