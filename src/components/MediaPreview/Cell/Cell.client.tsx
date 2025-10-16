'use client'

import type { MediaPreviewContentMode, MediaPreviewMode } from '@/fields/mediaPreviewField.js'
import type { PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys } from '@/translations/index.js'

import { Pill, useTranslation } from '@payloadcms/ui'
import { EyeIcon } from '@payloadcms/ui/icons/Eye'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ExternalLinkIcon } from '../ExternalLinkIcon/ExternalLinkIcon.js'
import {
  canPreviewDocument,
  getDocumentViewerType,
  getGoogleViewerUrl,
  getMicrosoftViewerUrl,
  getPreviewType,
} from '../MediaPreview.utils.js'
import { MediaPreviewModal } from '../Modal/Modal.js'

type Props = {
  contentMode?: MediaPreviewContentMode
  media: {
    bunnyVideoId?: string
    fileSize?: number
    height?: number
    mimeType?: string
    streamLibraryId?: number
    url?: string
    width?: number
  }
  mode?: MediaPreviewMode
  rowId?: number | string
}

export const MediaPreviewCellClient: React.FC<Props> = ({ contentMode, media, mode = 'auto', rowId }) => {
  const { bunnyVideoId, fileSize, height, mimeType, streamLibraryId, url, width } = media
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const { t } = useTranslation<PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys>()

  const audioViewerMode = contentMode?.audio ?? 'inline'
  const documentViewerMode = contentMode?.document ?? 'inline'
  const imageViewerMode = contentMode?.image ?? 'inline'
  const videoViewerMode = contentMode?.video ?? 'inline'

  const previewType = useMemo(() => getPreviewType(mimeType), [mimeType])
  const isAudioFile = previewType === 'audio'
  const isDocumentFile = previewType === 'document'
  const isImageFile = previewType === 'image'
  const isVideoFile = previewType === 'video'
  const canPreview = !isDocumentFile || canPreviewDocument(fileSize)

  const modalMode = useMemo(
    () => (mode === 'fullscreen' ? 'fullscreen' : isTouchDevice ? 'fullscreen' : 'popup'),
    [mode, isTouchDevice],
  )

  const documentViewerUrl = useMemo<null | string>(() => {
    if (isDocumentFile && url && mimeType) {
      const viewerType = getDocumentViewerType(mimeType)
      return viewerType === 'microsoft' ? getMicrosoftViewerUrl(url) : getGoogleViewerUrl(url)
    }
    return null
  }, [isDocumentFile, url, mimeType])

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowModal((prev) => !prev)
  }, [])

  const renderNewTabLink = useCallback(
    (href: string) => (
      <div className="bunny-media-preview-cell">
        <a className="bunny-media-preview-cell__button-wrapper" href={href} rel="noopener noreferrer" target="_blank">
          <Pill
            alignIcon="left"
            className="bunny-media-preview-cell__pill"
            icon={<ExternalLinkIcon className="bunny-media-preview-cell__icon" />}
            size="small"
          >
            {t('@seshuk/payload-storage-bunny:mediaPreviewOpen')}
          </Pill>
        </a>
      </div>
    ),
    [t],
  )

  if (previewType === 'unsupported' || (!bunnyVideoId && !url) || !canPreview) {
    return <span>—</span>
  }

  if (isVideoFile && videoViewerMode === 'newTab' && url) {
    return renderNewTabLink(url)
  }

  if (isAudioFile && audioViewerMode === 'newTab' && url) {
    return renderNewTabLink(url)
  }

  if (isImageFile && imageViewerMode === 'newTab' && url) {
    return renderNewTabLink(url)
  }

  if (isDocumentFile && documentViewerMode === 'newTab' && documentViewerUrl) {
    return renderNewTabLink(documentViewerUrl)
  }

  return (
    <>
      <div className="bunny-media-preview-cell">
        <button
          className="bunny-media-preview-cell__button-wrapper"
          onClick={handleClick}
          ref={buttonRef}
          type="button"
        >
          <Pill
            alignIcon="left"
            className={`bunny-media-preview-cell__pill ${showModal ? 'bunny-media-preview-cell__pill--active' : ''}`}
            icon={<EyeIcon active={modalMode === 'popup' && showModal} className="bunny-media-preview-cell__icon" />}
            size="small"
          >
            {modalMode === 'popup' && showModal
              ? t('@seshuk/payload-storage-bunny:mediaPreviewClose')
              : t('@seshuk/payload-storage-bunny:mediaPreviewOpen')}
          </Pill>
        </button>
      </div>

      <MediaPreviewModal
        media={{
          bunnyVideoId,
          documentViewerUrl,
          height,
          mimeType,
          streamLibraryId,
          url,
          width,
        }}
        mode={modalMode}
        onClose={() => setShowModal(false)}
        rowId={rowId}
        show={showModal}
        triggerRef={buttonRef}
      />
    </>
  )
}
