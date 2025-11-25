import type { MediaPreviewContentMode, MediaPreviewMode } from '@/fields/mediaPreviewField.js'
import type { PluginStorageBunnyTranslationsKeys } from '@/translations/index.js'
import type { BunnyData } from '@/types/index.js'
import type { UIFieldServerProps } from 'payload'

import { getTranslation, type TFunction } from '@payloadcms/translations'
import { FieldLabel } from '@payloadcms/ui'
import React from 'react'

import { MediaPreviewFieldClient } from './Field/Field.js'
import { FIELD_BASE_CLASS } from './MediaPreview.constants.js'
import { getPreviewType } from './MediaPreview.utils.js'

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
    req,
  } = props

  const reqT = req.t as unknown as TFunction<PluginStorageBunnyTranslationsKeys>

  const bunnyData = data?.bunnyData as BunnyData | undefined
  const fileSize = data?.filesize as number | undefined
  const height = data?.height as number | undefined
  const mimeType = data?.mimeType as string | undefined
  const url = data?.url as string | undefined
  const width = data?.width as number | undefined

  const previewType = getPreviewType(mimeType)
  if (previewType === 'unsupported') {
    return null
  }

  let fieldLabel: string | undefined
  if (label === '@seshuk/payload-storage-bunny:mediaPreviewLabel') {
    fieldLabel = reqT('@seshuk/payload-storage-bunny:mediaPreviewLabel')
  } else if (label) {
    const translatedLabel = getTranslation(label, req.i18n)
    fieldLabel = translatedLabel && translatedLabel !== '' ? translatedLabel : undefined
  }

  return (
    <div className={`${FIELD_BASE_CLASS} bunny-media-preview`}>
      {fieldLabel && <FieldLabel htmlFor={path} label={fieldLabel} />}
      <MediaPreviewFieldClient
        contentMode={contentMode}
        media={{
          bunnyData,
          fileSize,
          height,
          mimeType,
          url,
          width,
        }}
        mode={mode}
      />
    </div>
  )
}
