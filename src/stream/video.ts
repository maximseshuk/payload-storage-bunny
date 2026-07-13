import type { TypeWithID } from 'payload'

import { readStoredVideo } from '@/fields/bunnyGroupField.js'
import { BunnyStreamVideoStatus } from '@/stream/api.js'
import type { BunnyDataInternal } from '@/types/core.js'

export const canUploadToVideo = (status: BunnyStreamVideoStatus): boolean => {
  return status === BunnyStreamVideoStatus.Created
}

export const isVideoInErrorState = (status: BunnyStreamVideoStatus): boolean => {
  return status === BunnyStreamVideoStatus.Error || status === BunnyStreamVideoStatus.UploadFailed
}

export const isVideoProcessed = (status: BunnyStreamVideoStatus): boolean => {
  const processedStatuses = [
    BunnyStreamVideoStatus.Uploaded,
    BunnyStreamVideoStatus.Processing,
    BunnyStreamVideoStatus.Transcoding,
    BunnyStreamVideoStatus.Finished,
    BunnyStreamVideoStatus.JitSegmenting,
    BunnyStreamVideoStatus.JitPlaylistsCreated,
  ]

  return processedStatuses.includes(status)
}

export const getBunnyData = (doc: TypeWithID | undefined, filename: string): BunnyDataInternal | null => {
  if (!doc || typeof doc !== 'object') {
    return null
  }

  if (filename && 'filename' in doc && doc.filename !== filename) {
    return null
  }

  const stored = readStoredVideo(doc)
  if (!stored?.videoId || typeof stored.videoId !== 'string') {
    return null
  }

  return {
    stream: {
      resolutions: stored.resolutions,
      videoId: stored.videoId,
    },
  }
}
