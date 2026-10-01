import { sanitizePrefix } from '@payloadcms/plugin-cloud-storage/utilities'
import type { CollectionConfig, PayloadRequest, TypeWithID } from 'payload'

type ResolveStoragePrefixArgs = {
  clientUploadContext?: unknown
  collection: CollectionConfig
  doc?: null | TypeWithID
  fallbackPrefix?: string
  filename: string
  prefixQueryParam?: string
  req: PayloadRequest
}

export const getStoragePrefix = ({
  collectionPrefix,
  docPrefix,
}: {
  collectionPrefix?: string
  docPrefix?: unknown
}): string => sanitizePrefix(typeof docPrefix === 'string' ? docPrefix : '') || sanitizePrefix(collectionPrefix ?? '')

const hasStringPrefix = (value: unknown): value is { prefix: string } =>
  typeof value === 'object' &&
  value !== null &&
  'prefix' in value &&
  typeof (value as { prefix: unknown }).prefix === 'string'

export const resolveStoragePrefix = async ({
  clientUploadContext,
  collection,
  doc,
  fallbackPrefix,
  filename,
  prefixQueryParam,
  req,
}: ResolveStoragePrefixArgs): Promise<string> => {
  if (typeof prefixQueryParam === 'string') {
    return getStoragePrefix({ collectionPrefix: fallbackPrefix, docPrefix: prefixQueryParam })
  }

  if (hasStringPrefix(clientUploadContext)) {
    return getStoragePrefix({ collectionPrefix: fallbackPrefix, docPrefix: clientUploadContext.prefix })
  }

  if (hasStringPrefix(doc)) {
    return getStoragePrefix({ collectionPrefix: fallbackPrefix, docPrefix: doc.prefix })
  }

  const hasPrefixField = (collection.fields || []).some((field) => 'name' in field && field.name === 'prefix')
  if (hasPrefixField) {
    const imageSizes = (typeof collection.upload === 'object' && collection.upload.imageSizes) || []

    const files = await req.payload.find({
      collection: collection.slug,
      depth: 0,
      draft: true,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        or: [
          { filename: { equals: filename } },
          ...imageSizes.map((imageSize) => ({
            [`sizes.${imageSize.name}.filename`]: { equals: filename },
          })),
        ],
      },
    })

    return getStoragePrefix({ collectionPrefix: fallbackPrefix, docPrefix: files?.docs?.[0]?.prefix })
  }

  return getStoragePrefix({ collectionPrefix: fallbackPrefix })
}
