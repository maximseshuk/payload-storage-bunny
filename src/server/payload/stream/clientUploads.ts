import type { CollectionContext } from '@/shared/types/index.js'

type StreamClientUpload = {
  head: string
  videoId: string
}

export const hasStreamClientUploads = (context: CollectionContext): boolean =>
  context.isTusUploadSupported && (!context.storageConfig || !!context.storageConfig.clientUploads)

export const getStreamClientUpload = (clientUploadContext: unknown): StreamClientUpload | undefined => {
  if (typeof clientUploadContext !== 'object' || clientUploadContext === null) {
    return undefined
  }
  const { head, videoId } = clientUploadContext as Partial<Record<keyof StreamClientUpload, unknown>>
  if (typeof videoId !== 'string' || !videoId) {
    return undefined
  }
  return { head: typeof head === 'string' ? head : '', videoId }
}
