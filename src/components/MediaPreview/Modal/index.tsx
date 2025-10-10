'use client'

import type { PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys } from '@/translations/index.js'

import { Modal, useModal, useTranslation } from '@payloadcms/ui'
import { XIcon } from '@payloadcms/ui/icons/X'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { MediaPreviewViewer } from '../Viewer/index.js'
import './index.scss'

const POPUP_DIMENSIONS = {
  MAX_HEIGHT: 290,
  MAX_WIDTH: 480,
  MIN_HEIGHT: 200,
  MIN_WIDTH: 200,
} as const

const AUDIO_DIMENSIONS = {
  HEIGHT: 40,
  WIDTH: 300,
} as const

const SPACING = {
  BOTTOM: 4,
  CARET_SIZE: 10,
  TOP: 24,
  VIEWPORT_MARGIN: 16,
} as const

export type MediaPreviewModalProps = {
  media: {
    bunnyVideoId?: string
    documentViewerUrl?: null | string
    height?: number
    mimeType?: string
    streamLibraryId?: number
    url?: string
    width?: number
  }
  mode: 'fullscreen' | 'popup'
  onClose?: () => void
  rowId?: number | string
  show: boolean
  triggerRef?: React.RefObject<HTMLButtonElement | HTMLElement | null>
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  media,
  mode,
  onClose,
  rowId,
  show,
  triggerRef,
}) => {
  const { bunnyVideoId, documentViewerUrl, height, mimeType, streamLibraryId, url, width } = media
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom')
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({})
  const audioRef = useRef<HTMLAudioElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const previousModalOpenRef = useRef<boolean>(false)

  const { closeModal, isModalOpen, openModal } = useModal()
  const { t } = useTranslation<PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys>()

  const modalSlug = useMemo(() => `bunny-media-preview-${rowId || 'field'}`, [rowId])

  const isAudio = useMemo(() => mimeType?.startsWith('audio/'), [mimeType])
  const isVideo = useMemo(() => mimeType?.startsWith('video/'), [mimeType])
  const isImage = useMemo(() => mimeType?.startsWith('image/'), [mimeType])

  const embedUrl = useMemo<null | string>(() => {
    if (bunnyVideoId && streamLibraryId) {
      const autoplay = mode === 'popup' ? 'true' : 'false'
      return `https://iframe.mediadelivery.net/embed/${streamLibraryId}/${bunnyVideoId}?autoplay=${autoplay}&preload=true&muted=false`
    }
    return null
  }, [bunnyVideoId, streamLibraryId, mode])

  const getPopupDimensions = useCallback((): { height: number; width: number } => {
    if (isImage && width && height) {
      const aspectRatio = width / height
      let popupHeight = POPUP_DIMENSIONS.MAX_HEIGHT
      let popupWidth = popupHeight * aspectRatio

      if (popupWidth > POPUP_DIMENSIONS.MAX_WIDTH) {
        popupWidth = POPUP_DIMENSIONS.MAX_WIDTH
        popupHeight = popupWidth / aspectRatio
      }

      return {
        height: Math.max(POPUP_DIMENSIONS.MIN_HEIGHT, popupHeight),
        width: Math.max(POPUP_DIMENSIONS.MIN_WIDTH, popupWidth),
      }
    }

    if (isAudio && !embedUrl) {
      return { height: AUDIO_DIMENSIONS.HEIGHT, width: AUDIO_DIMENSIONS.WIDTH }
    }

    return { height: POPUP_DIMENSIONS.MAX_HEIGHT, width: POPUP_DIMENSIONS.MAX_WIDTH }
  }, [isImage, width, height, isAudio, embedUrl])

  const calculatePopupPosition = useCallback(() => {
    if (!triggerRef?.current || mode !== 'popup') {
      return
    }

    const rect = triggerRef.current.getBoundingClientRect()
    const { height: popupHeight, width: popupWidth } = getPopupDimensions()

    const spacingTop = SPACING.CARET_SIZE + SPACING.TOP
    const spacingBottom = SPACING.CARET_SIZE + SPACING.BOTTOM

    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = document.documentElement.clientHeight

    let top: number
    let selectedPosition: 'bottom' | 'top'
    let left = rect.left + rect.width / 2 - popupWidth / 2

    const buttonCenterX = rect.left + rect.width / 2

    if (left + popupWidth > viewportWidth - SPACING.VIEWPORT_MARGIN) {
      left = viewportWidth - popupWidth - SPACING.VIEWPORT_MARGIN
    }
    if (left < SPACING.VIEWPORT_MARGIN) {
      left = SPACING.VIEWPORT_MARGIN
    }

    const caretLeft = buttonCenterX - left

    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top

    if (spaceBelow >= popupHeight + spacingBottom) {
      selectedPosition = 'bottom'
      top = rect.bottom + spacingBottom
    } else if (spaceAbove >= popupHeight + spacingTop) {
      selectedPosition = 'top'
      top = rect.top - popupHeight - spacingTop
    } else {
      if (spaceAbove > spaceBelow) {
        selectedPosition = 'top'
        top = rect.top - popupHeight - spacingTop
      } else {
        selectedPosition = 'bottom'
        top = rect.bottom + spacingBottom
      }
    }

    setPosition(selectedPosition)
    setPopupStyle({
      '--caret-left': `${caretLeft}px`,
      '--popup-height': `${popupHeight}px`,
      '--popup-width': `${popupWidth}px`,
      left: `${left}px`,
      top: `${top}px`,
    } as React.CSSProperties)
  }, [triggerRef, mode, getPopupDimensions])

  useEffect(() => {
    if (mode === 'fullscreen') {
      if (show && !isModalOpen(modalSlug)) {
        openModal(modalSlug)
      }
    }
  }, [show, mode, modalSlug, isModalOpen, openModal])

  useEffect(() => {
    if (mode === 'fullscreen' && !show && isModalOpen(modalSlug)) {
      closeModal(modalSlug)
    }
  }, [show, mode, modalSlug, isModalOpen, closeModal])

  useEffect(() => {
    if (mode === 'fullscreen') {
      const currentModalOpen = isModalOpen(modalSlug)

      if (previousModalOpenRef.current && !currentModalOpen && show) {
        onClose?.()
      }

      previousModalOpenRef.current = currentModalOpen
    }
  }, [isModalOpen, modalSlug, mode, show, onClose])

  useEffect(() => {
    if (!show) {
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.currentTime = 0
      }
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
    }
  }, [show])

  useEffect(() => {
    if (show && mode === 'popup') {
      calculatePopupPosition()

      window.addEventListener('resize', calculatePopupPosition)
      window.addEventListener('scroll', calculatePopupPosition, true)

      return () => {
        window.removeEventListener('resize', calculatePopupPosition)
        window.removeEventListener('scroll', calculatePopupPosition, true)
      }
    }
  }, [show, mode, calculatePopupPosition])

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        triggerRef?.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        onClose?.()
      }
    },
    [onClose, triggerRef],
  )

  useEffect(() => {
    if (!show || mode !== 'popup') {
      return
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [show, mode, handleClickOutside])

  const handleModalClose = useCallback(() => {
    closeModal(modalSlug)
    onClose?.()
  }, [closeModal, modalSlug, onClose])

  const handleBackdropClick = useCallback(
    (e: React.KeyboardEvent | React.MouseEvent) => {
      if ('key' in e && e.key !== 'Enter' && e.key !== ' ') {
        return
      }

      const target = e.target as HTMLElement

      if (
        target.tagName === 'IMG' ||
        target.tagName === 'VIDEO' ||
        target.tagName === 'AUDIO' ||
        target.tagName === 'IFRAME' ||
        target.classList.contains('bunny-media-preview-modal__close') ||
        target.closest('.bunny-media-preview-modal__close')
      ) {
        return
      }

      handleModalClose()
    },
    [handleModalClose],
  )

  const viewerContent = useMemo(
    () => (
      <MediaPreviewViewer
        className={
          embedUrl || documentViewerUrl
            ? 'bunny-media-preview-modal__iframe'
            : isVideo
              ? 'bunny-media-preview-modal__video'
              : isAudio
                ? 'bunny-media-preview-modal__audio'
                : 'bunny-media-preview-modal__image'
        }
        media={{
          documentViewerUrl,
          embedUrl,
          mimeType,
          url,
        }}
        refs={{
          audioRef,
          iframeRef,
          imgRef,
          videoRef,
        }}
        title={
          isVideo
            ? t('@seshuk/payload-storage-bunny:mediaPreviewTitleVideo')
            : isImage
              ? t('@seshuk/payload-storage-bunny:mediaPreviewTitleImage')
              : isAudio
                ? t('@seshuk/payload-storage-bunny:mediaPreviewTitleAudio')
                : t('@seshuk/payload-storage-bunny:mediaPreviewTitleDocument')
        }
      />
    ),
    [embedUrl, documentViewerUrl, isVideo, isAudio, isImage, mimeType, url, t],
  )

  if (mode === 'popup') {
    if (!show) {
      return null
    }

    return (
      <div
        className={`bunny-media-preview-modal bunny-media-preview-modal--popup bunny-media-preview-modal--show bunny-media-preview-modal--position-${position}`}
        ref={popupRef}
        style={popupStyle}
      >
        <div className="bunny-media-preview-modal__body">{viewerContent}</div>
      </div>
    )
  }

  if (!isModalOpen(modalSlug)) {
    return null
  }

  return (
    <Modal
      className="bunny-media-preview-modal bunny-media-preview-modal--fullscreen"
      onClick={handleBackdropClick}
      slug={modalSlug}
    >
      <div
        aria-label={t('@seshuk/payload-storage-bunny:mediaPreviewClose')}
        className="bunny-media-preview-modal__wrapper"
        onClick={handleBackdropClick}
        onKeyDown={handleBackdropClick}
        role="button"
        tabIndex={-1}
      >
        <button
          aria-label={t('@seshuk/payload-storage-bunny:mediaPreviewClose')}
          className="drawer-close-button bunny-media-preview-modal__close"
          onClick={handleModalClose}
          type="button"
        >
          <XIcon />
        </button>
        <div className="bunny-media-preview-modal__content" role="dialog" tabIndex={-1}>
          <div className="bunny-media-preview-modal__body">{viewerContent}</div>
        </div>
      </div>
    </Modal>
  )
}
