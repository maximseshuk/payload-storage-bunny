import type { MediaPreviewAdapter, MediaPreviewAdapterResolveArgs } from '@seshuk/payload-plugin-media-preview'

import type { BunnyData } from '@/shared/types/index.js'

const getBunnyStreamData = (doc: Record<string, unknown>): BunnyData['stream'] | null => {
  const bunnyData = doc.bunnyData as BunnyData | undefined
  if (bunnyData?.type === 'stream' && bunnyData.stream?.videoId && bunnyData.stream.libraryId) {
    return bunnyData.stream
  }
  return null
}

const getBunnyEmbedUrl = (libraryId: number, videoId: string): string =>
  `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?autoplay=false&preload=true&muted=false`

const resolve = ({ doc, mimeType }: MediaPreviewAdapterResolveArgs) => {
  if (!mimeType?.startsWith('video/') && !mimeType?.startsWith('audio/')) {
    return null
  }

  const stream = getBunnyStreamData(doc)
  if (!stream) {
    return null
  }

  return {
    mode: 'inline' as const,
    props: {
      allow: 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;',
      allowFullScreen: true,
      src: getBunnyEmbedUrl(stream.libraryId, stream.videoId),
    },
  }
}

export const bunnyStreamAdapter: MediaPreviewAdapter = {
  name: 'bunny-stream',
  Component: '@seshuk/payload-plugin-media-preview/client#IframeViewer',
  resolve,
}
