import type { MediaPreviewContentMode, MediaPreviewMode } from '@/fields/mediaPreviewField.js'
import type { PluginStorageBunnyTranslationsKeys } from '@/translations/index.js'
import type { UIFieldServerProps } from 'payload'

import { getTranslation, type TFunction } from '@payloadcms/translations'
import { FieldLabel } from '@payloadcms/ui'
import React from 'react'

import { MediaPreviewFieldClient } from './Field/index.js'
import { getPreviewType } from './utils.js'

const fieldBaseClass = 'field-type'

type MediaPreviewProps = {
  contentMode?: MediaPreviewContentMode
  mode?: MediaPreviewMode
} & UIFieldServerProps

export const MediaPreview: React.FC<MediaPreviewProps> = (props) => {
  const {
    clientField: { label },
    contentMode,
    data,
    mode = 'auto',
    path,
    payload,
    req,
  } = props

  const reqT = req.t as unknown as TFunction<PluginStorageBunnyTranslationsKeys>

  const bunnyVideoId = data?.bunnyVideoId as string | undefined
  const fileSize = data?.filesize as number | undefined
  const height = data?.height as number | undefined
  const mimeType = data?.mimeType as string | undefined
  const url = data?.url as string | undefined
  const width = data?.width as number | undefined

  const collectionSlug = req.routeParams?.collection as string | undefined

  const previewType = getPreviewType(mimeType)
  if (previewType === 'unsupported') {
    return null
  }

  let streamLibraryId: number | undefined
  if (bunnyVideoId && collectionSlug) {
    const collectionConfig = payload.collections[collectionSlug]?.config
    streamLibraryId = collectionConfig?.admin?.custom?.['@seshuk/payload-storage-bunny']?.streamLibraryId as
      | number
      | undefined
  }

  let fieldLabel: string | undefined
  if (label === '@seshuk/payload-storage-bunny:mediaPreviewLabel') {
    fieldLabel = reqT('@seshuk/payload-storage-bunny:mediaPreviewLabel')
  } else if (label) {
    const translatedLabel = getTranslation(label, req.i18n)
    fieldLabel = translatedLabel && translatedLabel !== '' ? translatedLabel : undefined
  }

  return (
    <div className={`${fieldBaseClass} bunny-media-preview`}>
      {fieldLabel && <FieldLabel htmlFor={path} label={fieldLabel} />}
      <MediaPreviewFieldClient
        contentMode={contentMode}
        media={{
          bunnyVideoId,
          fileSize,
          height,
          mimeType,
          streamLibraryId,
          url,
          width,
        }}
        mode={mode}
      />
    </div>
  )
}

export default MediaPreview
