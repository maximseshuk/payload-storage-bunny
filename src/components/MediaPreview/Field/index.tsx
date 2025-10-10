'use client'

import type { MediaPreviewContentMode, MediaPreviewMode } from '@/fields/mediaPreviewField.js'
import type { PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys } from '@/translations/index.js'

import { Button, useTranslation } from '@payloadcms/ui'
import { EyeIcon } from '@payloadcms/ui/icons/Eye'
import React, { useCallback, useMemo, useState } from 'react'

import { ExternalLinkIcon } from '../ExternalLinkIcon/index.js'
import { MediaPreviewModal } from '../Modal/index.js'
import {
  canPreviewDocument,
  getDocumentViewerType,
  getGoogleViewerUrl,
  getMicrosoftViewerUrl,
  getPreviewType,
} from '../utils.js'
import './index.scss'

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
}

export const MediaPreviewFieldClient: React.FC<Props> = ({ contentMode, media, mode: _mode = 'auto' }) => {
  const { bunnyVideoId, fileSize, height, mimeType, streamLibraryId, url, width } = media
  const [showModal, setShowModal] = useState(false)
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

  const documentViewerUrl = useMemo<null | string>(() => {
    if (isDocumentFile && url && mimeType) {
      const viewerType = getDocumentViewerType(mimeType)
      return viewerType === 'microsoft' ? getMicrosoftViewerUrl(url) : getGoogleViewerUrl(url)
    }
    return null
  }, [isDocumentFile, url, mimeType])

  const handleToggleModal = useCallback(() => {
    setShowModal((prev) => !prev)
  }, [])

  const renderNewTabButton = useCallback(
    (href: string) => (
      <div className="bunny-media-preview__button-wrapper">
        <Button
          buttonStyle="secondary"
          el="anchor"
          icon={<ExternalLinkIcon />}
          iconPosition="left"
          newTab
          size="medium"
          url={href}
        >
          {t('@seshuk/payload-storage-bunny:mediaPreviewOpen')}
        </Button>
      </div>
    ),
    [t],
  )

  if (previewType === 'unsupported' || (!bunnyVideoId && !url) || !canPreview) {
    return null
  }

  if (isVideoFile && videoViewerMode === 'newTab' && url) {
    return renderNewTabButton(url)
  }

  if (isAudioFile && audioViewerMode === 'newTab' && url) {
    return renderNewTabButton(url)
  }

  if (isImageFile && imageViewerMode === 'newTab' && url) {
    return renderNewTabButton(url)
  }

  if (isDocumentFile && documentViewerMode === 'newTab' && documentViewerUrl) {
    return renderNewTabButton(documentViewerUrl)
  }

  return (
    <>
      <div className="bunny-media-preview__button-wrapper">
        <Button
          buttonStyle="secondary"
          icon={<EyeIcon active={false} />}
          iconPosition="left"
          onClick={handleToggleModal}
          size="medium"
        >
          {t('@seshuk/payload-storage-bunny:mediaPreviewOpen')}
        </Button>
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
        mode="fullscreen"
        onClose={() => setShowModal(false)}
        show={showModal}
      />
    </>
  )
}
