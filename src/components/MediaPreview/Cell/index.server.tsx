import type { MediaPreviewContentMode, MediaPreviewMode } from '@/fields/mediaPreviewField.js'
import type { DefaultServerCellComponentProps } from 'payload'

import React from 'react'

import { MediaPreviewCellClient } from './index.client.js'
import './index.scss'

type Props = {
  contentMode?: MediaPreviewContentMode
  mode?: MediaPreviewMode
} & DefaultServerCellComponentProps

export const MediaPreviewCell: React.FC<Props> = ({ collectionConfig, contentMode, mode = 'auto', rowData }) => {
  const bunnyVideoId = rowData?.bunnyVideoId as string | undefined
  const fileSize = rowData?.filesize as number | undefined
  const height = rowData?.height as number | undefined
  const mimeType = rowData?.mimeType as string | undefined
  const url = rowData?.url as string | undefined
  const width = rowData?.width as number | undefined
  const streamLibraryId = collectionConfig?.admin?.custom?.['@seshuk/payload-storage-bunny']?.stream?.libraryId as
    | number
    | undefined

  return (
    <MediaPreviewCellClient
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
      rowId={rowData?.id}
    />
  )
}
