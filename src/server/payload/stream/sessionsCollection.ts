import type { BasePayload, CollectionConfig, PayloadRequest, TypeWithID } from 'payload'

type StreamUploadSession = {
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
    versions: false,
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
    overrideAccess: true,
  })) as unknown as StreamUploadSession
}

export const deleteStreamVideoSession = async ({
  libraryId,
  req,
  videoId,
}: {
  libraryId: number
  req: PayloadRequest
  videoId: string
}): Promise<void> => {
  await req.payload.delete({
    collection: streamUploadSessionsCollectionSlug,
    overrideAccess: true,
    req,
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
