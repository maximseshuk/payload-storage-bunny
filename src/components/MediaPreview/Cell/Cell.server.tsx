import type { MediaPreviewContentMode, MediaPreviewMode } from '@/fields/mediaPreviewField.js'
import type { BunnyData } from '@/types/index.js'
import type { DefaultServerCellComponentProps } from 'payload'

import React from 'react'

import { MediaPreviewCellClient } from './Cell.client.js'
import './Cell.scss'

type Props = {
  contentMode?: MediaPreviewContentMode
  mode?: MediaPreviewMode
} & DefaultServerCellComponentProps

export const MediaPreviewCell: React.FC<Props> = ({ contentMode, mode = 'auto', rowData }) => {
  const bunnyData = rowData?.bunnyData as BunnyData | undefined
  const fileSize = rowData?.filesize as number | undefined
  const height = rowData?.height as number | undefined
  const mimeType = rowData?.mimeType as string | undefined
  const url = rowData?.url as string | undefined
  const width = rowData?.width as number | undefined

  return (
    <MediaPreviewCellClient
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
      rowId={rowData?.id}
    />
  )
}
