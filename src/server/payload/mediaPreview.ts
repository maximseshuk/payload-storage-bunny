import type { MediaPreviewAdapter, MediaPreviewAdapterResolveArgs } from '@seshuk/payload-plugin-media-preview'

import { getBunnyOptions } from '@/server/payload/options/access.js'
import { getBunnyEmbedUrl, STREAM_PLAYER_ALLOW } from '@/shared/streamEmbed.js'
import type { BunnyData } from '@/shared/types/index.js'

const getBunnyStreamData = (doc: Record<string, unknown>): BunnyData['stream'] | null => {
  const bunnyData = doc.bunnyData as BunnyData | undefined
  if (bunnyData?.type === 'stream' && bunnyData.stream?.videoId && bunnyData.stream.libraryId) {
    return bunnyData.stream
  }
  return null
}

const resolve = ({ collectionSlug, doc, mimeType, payload }: MediaPreviewAdapterResolveArgs) => {
  if (!mimeType?.startsWith('video/') && !mimeType?.startsWith('audio/')) {
    return null
  }

  const stream = getBunnyStreamData(doc)
  if (!stream) {
    return null
  }

  const player = {
    allow: STREAM_PLAYER_ALLOW,
    allowFullScreen: true,
    src: getBunnyEmbedUrl(stream.libraryId, stream.videoId),
    title: doc.filename,
  }

  if (getBunnyOptions(payload)?.collections.get(collectionSlug)?.stream?.status === false) {
    return { mode: 'inline' as const, props: player }
  }

  return {
    mode: 'inline' as const,
    props: {
      ...player,
      id: doc.id,
      collectionSlug,
      status: stream.status,
      videoId: stream.videoId,
    },
  }
}

export const bunnyStreamAdapter: MediaPreviewAdapter = {
  name: 'bunny-stream',
  Component: '@seshuk/payload-storage-bunny/client#StreamPreview',
  mimeTypes: ['video/*', 'audio/*'],
  resolve,
}
