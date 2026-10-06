'use client'

import { Thumbnail, useConfig, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { AudioPreview } from '@payloadcms/ui/elements/FileManager/FilePreview/AudioPreview'
import { VideoPreview } from '@payloadcms/ui/elements/FileManager/FilePreview/VideoPreview'
import { appendCacheTag } from '@payloadcms/ui/utilities/appendCacheTag'
import type { UploadFilePreviewClientProps } from 'payload'
import React from 'react'

import { StreamPreview } from '@/client/StreamPreview/StreamPreview.js'
import { PLUGIN_KEY } from '@/shared/constants.js'
import { isStreamFileMimeType } from '@/shared/mimeTypes.js'
import { getBunnyEmbedUrl, STREAM_PLAYER_ALLOW } from '@/shared/streamEmbed.js'
import type { StreamVideoState } from '@/shared/types/index.js'

export const StreamFilePreview: React.FC<{ status?: boolean } & UploadFilePreviewClientProps> = ({
  filename,
  status,
}) => {
  const { id, collectionSlug, data } = useDocumentInfo()
  const { getEntityConfig } = useConfig()
  const videoId = useFormFields(([fields]) => fields['bunnyData.stream.videoId']?.value) as string | undefined
  const libraryId = useFormFields(([fields]) => fields['bunnyData.stream.libraryId']?.value) as number | undefined
  const formMimeType = useFormFields(([fields]) => fields.mimeType?.value)
  const streamMimeTypes = collectionSlug
    ? getEntityConfig({ collectionSlug })?.admin?.custom?.[PLUGIN_KEY]?.stream?.mimeTypes
    : undefined

  if (!videoId || !libraryId || !isStreamFileMimeType(formMimeType, streamMimeTypes)) {
    const url = typeof data?.url === 'string' ? data.url : undefined
    const mimeType = typeof data?.mimeType === 'string' ? data.mimeType : ''
    const cacheTag: false | string | undefined =
      collectionSlug && getEntityConfig({ collectionSlug })?.upload?.cacheTags ? data?.updatedAt : undefined

    if (url && mimeType.startsWith('audio/')) {
      return <AudioPreview fileSrc={appendCacheTag(url, cacheTag)} />
    }
    if (url && mimeType.startsWith('video/')) {
      return <VideoPreview fileSrc={appendCacheTag(url, cacheTag)} />
    }
    return (
      <Thumbnail
        className="file-preview__thumbnail"
        collectionSlug={collectionSlug}
        doc={data}
        fileSrc={data?.thumbnailURL ?? url}
        imageCacheTag={cacheTag}
        size="expand"
      />
    )
  }

  const saved = id !== undefined && videoId === data?.bunnyData?.stream?.videoId

  return (
    <StreamPreview
      id={status && saved ? id : undefined}
      allow={STREAM_PLAYER_ALLOW}
      allowFullScreen
      collectionSlug={status ? collectionSlug : undefined}
      src={getBunnyEmbedUrl(libraryId, videoId)}
      status={saved ? (data?.bunnyData?.stream?.status as StreamVideoState | undefined) : 'processing'}
      title={filename}
      videoId={videoId}
    />
  )
}
