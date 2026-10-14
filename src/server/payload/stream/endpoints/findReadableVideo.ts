import type { PayloadRequest, TypeWithID } from 'payload'
import { isValidID, NotFound } from 'payload'

import { readStoredVideo, readStreamFileVideoId } from '@/server/payload/fields/bunnyGroupField.js'
import { createCollectionContext } from '@/server/payload/options/context.js'
import type { CollectionContext } from '@/shared/types/index.js'
import type { NormalizedBunnyStorageOptions, NormalizedStreamOptions } from '@/shared/types/optionsNormalized.js'

type ReadableVideo = {
  context: CollectionContext
  doc: TypeWithID
  stored: NonNullable<ReturnType<typeof readStoredVideo>>
  streamOptions: NormalizedStreamOptions
  videoId: string
}

export const findReadableVideo = async (
  options: NormalizedBunnyStorageOptions,
  req: PayloadRequest,
  isServed: (context: CollectionContext) => boolean,
): Promise<ReadableVideo> => {
  const {
    collection: collectionSlug,
    id,
    videoId,
  } = (req.routeParams ?? {}) as { collection?: string; id?: string; videoId?: string }
  const collection =
    collectionSlug && options.collections.has(collectionSlug)
      ? req.payload.collections[collectionSlug]?.config
      : undefined
  if (!collectionSlug || !id || !videoId || !collection) {
    throw new NotFound(req.t)
  }

  const context = createCollectionContext(options, collection)
  const idType = req.payload.collections[collectionSlug]?.customIDType || req.payload.db.defaultIDType
  const { streamOptions } = context
  if (!streamOptions || !isServed(context) || !isValidID(idType === 'number' ? Number(id) : id, idType)) {
    throw new NotFound(req.t)
  }

  const read = (draft: boolean) =>
    req.payload.findByID({
      id,
      collection: collectionSlug,
      depth: 0,
      draft,
      overrideAccess: false,
      req,
      select: { bunnyData: true, filesize: true, mimeType: true },
      trash: true,
    })
  let doc = await read(false)
  if (readStreamFileVideoId(doc, streamOptions.mimeTypes) !== videoId) {
    doc = await read(true)
  }
  const stored = readStoredVideo(doc)
  if (!stored || readStreamFileVideoId(doc, streamOptions.mimeTypes) !== videoId) {
    throw new NotFound(req.t)
  }

  return { context, doc, stored, streamOptions, videoId }
}
