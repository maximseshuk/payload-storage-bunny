import type { PayloadRequest, Where } from 'payload'

import type { NormalizedBunnyStorageOptions } from '@/shared/types/optionsNormalized.js'

export const getLibraryCollectionSlugs = (
  options: NormalizedBunnyStorageOptions,
  collectionSlug: string,
  libraryId: number | undefined,
): string[] => {
  const slugs = new Set([collectionSlug])
  for (const [slug, collectionOptions] of options.collections) {
    if (collectionOptions.stream && collectionOptions.stream.libraryId === libraryId) {
      slugs.add(slug)
    }
  }
  return [...slugs]
}

type IsVideoReferencedArgs = {
  collectionSlugs: string[]
  except?: { collection: string; id: number | string }
  req: PayloadRequest
  videoId: string
}

export const isVideoReferenced = async ({
  collectionSlugs,
  except,
  req,
  videoId,
}: IsVideoReferencedArgs): Promise<boolean> => {
  for (const slug of collectionSlugs) {
    const collection = req.payload.collections[slug]?.config
    if (!collection) {
      continue
    }
    const isExcluded = except?.collection === slug
    const docWhere: Where = { 'bunnyData.stream.videoId': { equals: videoId } }
    if (
      await req.payload.db.findOne({
        collection: slug,
        req,
        where: isExcluded ? { and: [docWhere, { id: { not_equals: except.id } }] } : docWhere,
      })
    ) {
      return true
    }
    if (!collection.versions) {
      continue
    }
    const versionWhere: Where = { 'version.bunnyData.stream.videoId': { equals: videoId } }
    const { docs } = await req.payload.db.findVersions({
      collection: slug,
      limit: 1,
      pagination: false,
      req,
      where: isExcluded ? { and: [versionWhere, { parent: { not_equals: except.id } }] } : versionWhere,
    })
    if (docs.length > 0) {
      return true
    }
  }
  return false
}
