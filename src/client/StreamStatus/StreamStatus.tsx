'use client'

import {
  CopyIcon,
  FieldLabel,
  NewTabIcon,
  RefreshIcon,
  Tooltip,
  useConfig,
  useDocumentInfo,
  useFormFields,
  useTranslation,
} from '@payloadcms/ui'
import type { DefaultCellComponentProps, SelectFieldClientComponent } from 'payload'
import { useLayoutEffect, useRef, useState } from 'react'

import { useStreamStatus } from '@/client/StreamStatus/streamStatusStore.js'
import { getBunnyStreamDashboardUrl } from '@/shared/bunnyDashboard.js'
import { PLUGIN_KEY } from '@/shared/constants.js'
import { isStreamFileMimeType } from '@/shared/mimeTypes.js'
import type { PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys } from '@/shared/translations/index.js'
import type { StreamVideoState } from '@/shared/types/index.js'

import './StreamStatus.css'

const BASE_CLASS = 'storage-bunny-stream-status'
const CARD_CLASS = 'storage-bunny-stream-card'

const STATUS_PILLS: Record<
  StreamVideoState,
  { label: PluginStorageBunnyTranslationsKeys; pillStyle: 'error' | 'success' | 'warning' }
> = {
  failed: { label: '@seshuk/payload-storage-bunny:streamStatusFailed', pillStyle: 'error' },
  processing: { label: '@seshuk/payload-storage-bunny:streamStatusProcessing', pillStyle: 'warning' },
  ready: { label: '@seshuk/payload-storage-bunny:streamStatusReady', pillStyle: 'success' },
}

const toStatus = (value: unknown): null | StreamVideoState =>
  typeof value === 'string' && Object.hasOwn(STATUS_PILLS, value) ? (value as StreamVideoState) : null

const toVideoId = (value: unknown): string => (typeof value === 'string' ? value : '')

const usePluginTranslation = () =>
  useTranslation<PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys>().t

const useStreamConfig = (collectionSlug: string | undefined) => {
  const { getEntityConfig } = useConfig()
  return collectionSlug ? getEntityConfig({ collectionSlug })?.admin?.custom?.[PLUGIN_KEY]?.stream : undefined
}

const useDashboardUrl = (collectionSlug: string | undefined, videoId: string): null | string => {
  const stream = useStreamConfig(collectionSlug)
  return stream?.link && stream.libraryId && videoId ? getBunnyStreamDashboardUrl(stream.libraryId, videoId) : null
}

const useTooltip = () => {
  const [show, setShow] = useState(false)
  const hide = () => setShow(false)
  return {
    handlers: {
      onBlur: hide,
      onClick: hide,
      onFocus: (event: React.FocusEvent<HTMLElement>) => setShow(event.currentTarget.matches(':focus-visible')),
      onPointerEnter: () => setShow(true),
      onPointerLeave: hide,
    },
    show,
  }
}

const StatusPill: React.FC<{ status: null | StreamVideoState; url: null | string }> = ({ status, url }) => {
  const t = usePluginTranslation()
  const tooltip = useTooltip()
  const label = t(status ? STATUS_PILLS[status].label : '@seshuk/payload-storage-bunny:streamStatusUnknown')
  const className = `pill pill--style-${status ? STATUS_PILLS[status].pillStyle : 'light-gray'} pill--size-small ${BASE_CLASS}`

  if (!url) {
    return (
      <span className={className}>
        <span className="pill__label">{label}</span>
      </span>
    )
  }

  const text = t('@seshuk/payload-storage-bunny:streamDashboardTooltip')

  return (
    <a
      aria-label={`${label}, ${text} ${t('@seshuk/payload-storage-bunny:streamDashboardNewTab')}`}
      className={`${className} ${BASE_CLASS}--link`}
      href={url}
      rel="noopener noreferrer"
      target="_blank"
      {...tooltip.handlers}
    >
      <Tooltip show={tooltip.show}>{text}</Tooltip>
      <span className="pill__label">{label}</span>
      <NewTabIcon className={`${BASE_CLASS}__icon`} size={16} />
    </a>
  )
}

export const StreamStatusCell: React.FC<DefaultCellComponentProps> = ({ collectionSlug, rowData }) => {
  const stream = rowData?.bunnyData?.stream
  const videoId = toVideoId(stream?.videoId)
  const url = useDashboardUrl(collectionSlug, videoId)

  if (!videoId) {
    return null
  }

  return (
    <div>
      <StatusPill status={toStatus(stream?.status)} url={url} />
    </div>
  )
}

const COPY_MESSAGES = { copied: 'general:copied', failed: 'error:unableToCopy' } as const

export const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const CopyVideoId: React.FC<{ videoId: string }> = ({ videoId }) => {
  const t = usePluginTranslation()
  const tooltip = useTooltip()
  const [result, setResult] = useState<keyof typeof COPY_MESSAGES | null>(null)
  const label = t('@seshuk/payload-storage-bunny:streamCopyVideoId')
  const message = result ? t(COPY_MESSAGES[result]) : ''
  const reset = () => setResult(null)

  return (
    <>
      <button
        aria-label={label}
        className={`btn btn--style-ghost btn--size-medium btn--icon btn--icon-only btn--round btn--no-margin ${CARD_CLASS}__copy`}
        type="button"
        {...tooltip.handlers}
        onBlur={() => {
          tooltip.handlers.onBlur()
          reset()
        }}
        onClick={async () => setResult((await copyText(videoId)) ? 'copied' : 'failed')}
        onPointerLeave={() => {
          tooltip.handlers.onPointerLeave()
          reset()
        }}
      >
        <Tooltip delay={result ? 0 : undefined} show={tooltip.show || result !== null}>
          {message || label}
        </Tooltip>
        <CopyIcon size={16} />
      </button>
      <span aria-live="polite" className="sr-only">
        {message}
      </span>
    </>
  )
}

const CheckStatus: React.FC<{
  checking: boolean
  focusTarget: React.RefObject<HTMLElement | null>
  onCheck: () => void
}> = ({ checking, focusTarget, onCheck }) => {
  const t = usePluginTranslation()
  const tooltip = useTooltip()
  const label = t('@seshuk/payload-storage-bunny:streamCheckStatus')
  const ref = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    const button = ref.current
    const target = focusTarget.current
    return () => {
      if (button && button === document.activeElement) {
        target?.focus()
      }
    }
  }, [focusTarget])

  return (
    <button
      aria-busy={checking || undefined}
      aria-disabled={checking || undefined}
      aria-label={label}
      className={`btn btn--style-ghost btn--size-medium btn--icon btn--icon-only btn--round btn--no-margin${checking ? ' btn--disabled' : ''} ${CARD_CLASS}__check`}
      ref={ref}
      type="button"
      {...tooltip.handlers}
      onClick={() => {
        tooltip.handlers.onClick()
        onCheck()
      }}
    >
      <Tooltip show={tooltip.show && !checking}>{label}</Tooltip>
      <RefreshIcon size={16} />
    </button>
  )
}

const DashboardLink: React.FC<{ url: string }> = ({ url }) => {
  const t = usePluginTranslation()
  const text = t('@seshuk/payload-storage-bunny:streamDashboardLink')

  return (
    <a
      aria-label={`${text} ${t('@seshuk/payload-storage-bunny:streamDashboardNewTab')}`}
      className={`btn btn--style-ghost btn--size-medium btn--icon btn--icon-position-right btn--no-margin ${CARD_CLASS}__link`}
      href={url}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span className="btn__content">
        <span className="btn__label">{text}</span>
        <span className="btn__icon">
          <NewTabIcon size={16} />
        </span>
      </span>
    </a>
  )
}

const toResolutions = (value: unknown): string[] => {
  const available = (value as { available?: unknown } | null | undefined)?.available
  return Array.isArray(available) ? available.filter((item): item is string => typeof item === 'string') : []
}

export const StreamStatusField: SelectFieldClientComponent = ({ path }) => {
  const t = usePluginTranslation()
  const { id, collectionSlug, data } = useDocumentInfo()
  const stored = data?.bunnyData?.stream
  const formVideoId = toVideoId(useFormFields(([fields]) => fields['bunnyData.stream.videoId']?.value))
  const mimeType = useFormFields(([fields]) => fields.mimeType?.value)
  const videoId = isStreamFileMimeType(mimeType, useStreamConfig(collectionSlug)?.mimeTypes) ? formVideoId : ''
  const saved = id !== undefined && videoId === toVideoId(stored?.videoId)
  const savedStatus = saved ? toStatus(stored?.status) : 'processing'
  const live = useStreamStatus({
    id: videoId && saved ? id : undefined,
    collection: collectionSlug,
    initialStatus: savedStatus,
    videoId,
  })
  const status = live.state === 'ready' && live.playerPending ? 'processing' : (toStatus(live.state) ?? savedStatus)
  const resolutions = toResolutions(live.resolutions ?? (saved ? stored?.resolutions : null))
  const url = useDashboardUrl(collectionSlug, videoId)
  const liveRef = useRef<HTMLSpanElement>(null)

  if (!videoId) {
    return null
  }

  return (
    <div className="field-type">
      <FieldLabel as="span" label={t('@seshuk/payload-storage-bunny:streamStatusLabel')} path={path} />
      <div className={CARD_CLASS}>
        <dl className={`${CARD_CLASS}__rows`}>
          <dt>{t('version:status')}</dt>
          <dd className={`${CARD_CLASS}__status`}>
            <span aria-live="polite" className={`${CARD_CLASS}__live`} ref={liveRef} tabIndex={-1}>
              <StatusPill status={status} url={null} />
              {live.error && (
                <span className={`${CARD_CLASS}__error`}>
                  {t('@seshuk/payload-storage-bunny:streamPreviewStatusError')}
                </span>
              )}
              {live.checked && status === 'processing' && (
                <span className="sr-only">{t('@seshuk/payload-storage-bunny:streamPreviewStillProcessing')}</span>
              )}
            </span>
            {saved && status !== 'ready' && status !== 'failed' && (
              <CheckStatus checking={live.checking} focusTarget={liveRef} onCheck={live.refresh} />
            )}
          </dd>
          <dt>{t('@seshuk/payload-storage-bunny:streamVideoId')}</dt>
          <dd className={`${CARD_CLASS}__id`}>
            <code title={videoId}>{videoId}</code>
            <CopyVideoId videoId={videoId} />
          </dd>
          {resolutions.length > 0 && (
            <>
              <dt>{t('@seshuk/payload-storage-bunny:streamMp4')}</dt>
              <dd>{resolutions.join(', ')}</dd>
            </>
          )}
        </dl>
        {url && (
          <div className={`${CARD_CLASS}__footer`}>
            <DashboardLink url={url} />
          </div>
        )}
      </div>
    </div>
  )
}
