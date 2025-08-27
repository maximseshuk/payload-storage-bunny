import type { BunnyStreamVideoDocumentMeta, StreamUploadSession, StreamVideoFromDocument } from '@/types/index.js'
import type { BasePayload, TypeWithID } from 'payload'

import { streamUploadSessionsCollectionSlug } from '@/collections/StreamUploadSessions.js'
import { BunnyStreamVideoStatus } from '@/types/index.js'

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

export const parseVideoFromDocument = (
  doc: TypeWithID | undefined,
  filename: string,
): StreamVideoFromDocument | undefined => {
  if (
    doc &&
    typeof doc === 'object' &&
    'id' in doc &&
    'filename' in doc &&
    doc.filename === filename &&
    'bunnyVideoId' in doc &&
    typeof doc.bunnyVideoId === 'string'
  ) {
    return {
      docId: doc.id,
      videoId: doc.bunnyVideoId,
      videoMeta: ('bunnyVideoMeta' in doc ? (doc.bunnyVideoMeta as BunnyStreamVideoDocumentMeta) : null),
    }
  }

  return undefined
}

export const createStreamVideoSession = async ({
  libraryId,
  payload,
  videoId,
}: {
  libraryId: number
  payload: BasePayload
  videoId: string
}): Promise<StreamUploadSession> => {
  return await payload.create({
    collection: streamUploadSessionsCollectionSlug,
    data: {
      libraryId: libraryId.toString(),
      videoId,
    },
  }) as unknown as StreamUploadSession
}

export const deleteStreamVideoSession = async ({
  libraryId,
  payload,
  videoId,
}: {
  libraryId: number
  payload: BasePayload
  videoId: string
}): Promise<void> => {
  await payload.delete({
    collection: streamUploadSessionsCollectionSlug,
    where: {
      libraryId: {
        equals: libraryId.toString(),
      },
      videoId: {
        equals: videoId,
      },
    },
  })
}
