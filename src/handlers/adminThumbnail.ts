import type { NormalizedThumbnailConfig } from '@/types/configNormalized.js'
import type { CollectionContext } from '@/types/index.js'

import { applyUrlTransform, generateSignedUrl, isImage } from '@/utils/index.js'
import { posix } from 'node:path'

const createBaseUrl = (hostname: string, prefix: string, filename: string): string => {
  return `https://${hostname}/${posix.join(prefix, filename)}`
}

const applyTransform = (
  config: false | NormalizedThumbnailConfig | undefined,
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
  const { collection, signedUrls, storageConfig, streamConfig, thumbnail } = context

  if (!thumbnail) {
    return undefined
  }

  return ({ doc }: { doc: Record<string, unknown> }): null | string => {
    if (
      thumbnail &&
      typeof thumbnail === 'object' &&
      thumbnail.sizeName &&
      doc.sizes &&
      typeof doc.sizes === 'object' &&
      doc.sizes !== null
    ) {
      const sizes = doc.sizes as Record<string, { filename?: string }>
      const requestedSize = sizes[thumbnail.sizeName]

      if (requestedSize && requestedSize.filename && typeof requestedSize.filename === 'string') {
        const sizeFilename = requestedSize.filename
        const prefix = typeof doc.prefix === 'string' ? doc.prefix : ''

        if (context.usePayloadAccessControl) {
          const internalUrl = `/api/${collection.slug}/file/${sizeFilename}`
          return applyTransform(thumbnail, context, doc, sizeFilename, prefix, internalUrl)
        }

        if (!storageConfig) {
          return null
        }

        const baseUrl = createBaseUrl(storageConfig.hostname, prefix, sizeFilename)
        const transformedUrl = applyTransform(thumbnail, context, doc, sizeFilename, prefix, baseUrl)
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
        return applyTransform(thumbnail, context, doc, filename, prefix, internalUrl)
      }

      if (!storageConfig) {
        return null
      }

      const baseUrl = createBaseUrl(storageConfig.hostname, prefix, filename)
      const transformedUrl = applyTransform(thumbnail, context, doc, filename, prefix, baseUrl)
      return signUrl(transformedUrl, signedUrls, storageConfig.tokenSecurityKey, collection, filename)
    }

    if (streamConfig && doc.bunnyVideoId && typeof doc.bunnyVideoId === 'string') {
      const isStreamAnimated = thumbnail && typeof thumbnail === 'object' && thumbnail.streamAnimated
      const thumbnailFile = isStreamAnimated ? 'preview.webp' : 'thumbnail.jpg'
      const filename = `${doc.bunnyVideoId}/${thumbnailFile}`
      const prefix = ''

      if (context.usePayloadAccessControl) {
        const internalUrl = `/api/${collection.slug}/file/bunny:stream:${doc.bunnyVideoId}:${thumbnailFile}`
        return applyTransform(thumbnail, context, doc, filename, prefix, internalUrl)
      }

      const baseUrl = createBaseUrl(streamConfig.hostname, prefix, filename)
      const transformedUrl = applyTransform(thumbnail, context, doc, filename, prefix, baseUrl)
      return signUrl(transformedUrl, signedUrls, streamConfig.tokenSecurityKey, collection, filename)
    }

    return null
  }
}
