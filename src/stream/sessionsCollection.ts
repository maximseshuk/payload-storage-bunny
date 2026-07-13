import type { BasePayload, CollectionConfig, TypeWithID } from 'payload'

export type StreamUploadSession = {
  createdAt: string
  libraryId: string
  videoId: string
} & TypeWithID

export const streamUploadSessionsCollectionSlug = 'bunny-stream-upload-sessions'

export const getStreamUploadSessionsCollection = (): CollectionConfig => {
  return {
    slug: streamUploadSessionsCollectionSlug,
    access: {
      create: () => false,
      delete: () => false,
      read: () => false,
      update: () => false,
    },
    admin: {
      hidden: true,
    },
    fields: [
      {
        name: 'libraryId',
        type: 'text',
        index: true,
        required: true,
      },
      {
        name: 'videoId',
        type: 'text',
        index: true,
        required: true,
      },
    ],
    lockDocuments: false,
    timestamps: true,
  }
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
  return (await payload.create({
    collection: streamUploadSessionsCollectionSlug,
    data: {
      libraryId: libraryId.toString(),
      videoId,
    },
  })) as unknown as StreamUploadSession
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
