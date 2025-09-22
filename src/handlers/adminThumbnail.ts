import type { NormalizedAdminThumbnailConfig } from '@/types/configNormalized.js'
import type { CollectionContext } from '@/types/index.js'

import { applyUrlTransform, generateSignedUrl, isImage } from '@/utils/index.js'
import { posix } from 'node:path'

const createBaseUrl = (hostname: string, prefix: string, filename: string): string => {
  return `https://${hostname}/${posix.join(prefix, filename)}`
}

const applyTransform = (
  config: false | NormalizedAdminThumbnailConfig | undefined,
  context: CollectionContext,
  doc: Record<string, unknown>,
  filename: string,
  prefix: string,
  url: string,
): string => {
  if (!config) {
    return url
  }

  const { sizeName: _sizeName, ...configWithoutSizeName } = config
  return applyUrlTransform({
    collection: context.collection,
    config: configWithoutSizeName,
    data: doc,
    filename,
    prefix,
    url,
  })
}

const signUrl = (
  baseUrl: string,
  signedUrls: CollectionContext['signedUrls'],
  tokenSecurityKey: string | undefined,
  collection: CollectionContext['collection'],
  filename: string,
): string => {
  if (!signedUrls || typeof signedUrls !== 'object' || !tokenSecurityKey) {
    return baseUrl
  }

  const shouldSign = signedUrls.shouldUseSignedUrl
    ? signedUrls.shouldUseSignedUrl({ collection, filename })
    : true

  return shouldSign ? generateSignedUrl(baseUrl, tokenSecurityKey, signedUrls) : baseUrl
}

export const getAdminThumbnail = (context: CollectionContext) => {
  const { adminThumbnail, collection, signedUrls, storageConfig, streamConfig } = context

  return ({ doc }: { doc: Record<string, unknown> }): null | string => {
    if (
      adminThumbnail &&
      typeof adminThumbnail === 'object' &&
      adminThumbnail.sizeName &&
      doc.sizes &&
      typeof doc.sizes === 'object' &&
      doc.sizes !== null
    ) {
      const sizes = doc.sizes as Record<string, { filename?: string }>
      const requestedSize = sizes[adminThumbnail.sizeName]

      if (requestedSize && requestedSize.filename && typeof requestedSize.filename === 'string') {
        const sizeFilename = requestedSize.filename
        const prefix = typeof doc.prefix === 'string' ? doc.prefix : ''

        if (context.usePayloadAccessControl) {
          const internalUrl = `/api/${collection.slug}/file/${sizeFilename}`
          return applyTransform(adminThumbnail, context, doc, sizeFilename, prefix, internalUrl)
        }

        const baseUrl = createBaseUrl(storageConfig.hostname, prefix, sizeFilename)
        const transformedUrl = applyTransform(adminThumbnail, context, doc, sizeFilename, prefix, baseUrl)
        return signUrl(
          transformedUrl,
          signedUrls,
          storageConfig.tokenSecurityKey,
          collection,
          sizeFilename,
        )
      }
    }

    if (doc.mimeType && isImage(doc.mimeType as string) && doc.filename && typeof doc.filename === 'string') {
      const filename = doc.filename
      const prefix = typeof doc.prefix === 'string' ? doc.prefix : ''

      if (context.usePayloadAccessControl) {
        const internalUrl = `/api/${collection.slug}/file/${filename}`
        return applyTransform(adminThumbnail, context, doc, filename, prefix, internalUrl)
      }

      const baseUrl = createBaseUrl(storageConfig.hostname, prefix, filename)
      const transformedUrl = applyTransform(adminThumbnail, context, doc, filename, prefix, baseUrl)
      return signUrl(transformedUrl, signedUrls, storageConfig.tokenSecurityKey, collection, filename)
    }

    if (streamConfig && doc.bunnyVideoId && typeof doc.bunnyVideoId === 'string') {
      const filename = `${doc.bunnyVideoId}/thumbnail.jpg`
      const prefix = ''

      if (context.usePayloadAccessControl) {
        const internalUrl = `/api/${collection.slug}/file/bunny:stream:${doc.bunnyVideoId}:thumbnail.jpg`
        return applyTransform(adminThumbnail, context, doc, filename, prefix, internalUrl)
      }

      const baseUrl = createBaseUrl(streamConfig.hostname, prefix, filename)
      const transformedUrl = applyTransform(adminThumbnail, context, doc, filename, prefix, baseUrl)
      return signUrl(transformedUrl, signedUrls, streamConfig.tokenSecurityKey, collection, filename)
    }

    return null
  }
}
