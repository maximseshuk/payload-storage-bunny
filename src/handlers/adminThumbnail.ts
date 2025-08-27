import type { CollectionContext } from '@/types/index.js'

import { applyUrlTransform, generateSignedUrl, isImage } from '@/utils/index.js'
import { posix } from 'node:path'

export const getAdminThumbnail = (context: CollectionContext) => {
  const { adminThumbnail, collection, signedUrls, storageConfig, streamConfig } = context

  return ({ doc }: { doc: Record<string, unknown> }): null | string => {
    if (doc.mimeType && isImage(doc.mimeType as string) && doc.filename && typeof doc.filename === 'string') {
      if (context.usePayloadAccessControl) {
        let internalUrl = `/api/${collection.slug}/file/${doc.filename}`

        if (adminThumbnail) {
          internalUrl = applyUrlTransform({
            collection,
            config: adminThumbnail,
            data: doc,
            filename: doc.filename,
            prefix: typeof doc.prefix === 'string' ? doc.prefix : '',
            url: internalUrl,
          })
        }

        return internalUrl
      }

      let baseUrl = `https://${storageConfig.hostname}/${posix.join(typeof doc.prefix === 'string' ? doc.prefix : '', doc.filename)}`

      if (adminThumbnail) {
        baseUrl = applyUrlTransform({
          collection,
          config: adminThumbnail,
          data: doc,
          filename: doc.filename,
          prefix: typeof doc.prefix === 'string' ? doc.prefix : '',
          url: baseUrl,
        })
      }

      if (signedUrls && typeof signedUrls === 'object' && storageConfig.tokenSecurityKey) {
        const shouldSign = signedUrls.shouldUseSignedUrl
          ? signedUrls.shouldUseSignedUrl({ collection, filename: doc.filename })
          : true

        if (shouldSign) {
          return generateSignedUrl(baseUrl, storageConfig.tokenSecurityKey, signedUrls)
        }
      }

      return baseUrl
    }

    if (streamConfig && doc.bunnyVideoId && typeof doc.bunnyVideoId === 'string') {
      if (context.usePayloadAccessControl) {
        let internalUrl = `/api/${collection.slug}/file/bunny:stream:${doc.bunnyVideoId}:thumbnail.jpg`

        if (adminThumbnail) {
          internalUrl = applyUrlTransform({
            collection,
            config: adminThumbnail,
            data: doc,
            filename: `${doc.bunnyVideoId}/thumbnail.jpg`,
            prefix: '',
            url: internalUrl,
          })
        }

        return internalUrl
      }

      let streamThumbnailUrl = `https://${streamConfig.hostname}/${doc.bunnyVideoId}/thumbnail.jpg`

      if (adminThumbnail) {
        streamThumbnailUrl = applyUrlTransform({
          collection,
          config: adminThumbnail,
          data: doc,
          filename: `${doc.bunnyVideoId}/thumbnail.jpg`,
          prefix: '',
          url: streamThumbnailUrl,
        })
      }

      if (signedUrls && typeof signedUrls === 'object' && streamConfig.tokenSecurityKey) {
        const shouldSign = signedUrls.shouldUseSignedUrl
          ? signedUrls.shouldUseSignedUrl({
            collection,
            filename: `${doc.bunnyVideoId}/thumbnail.jpg`,
          })
          : true

        if (shouldSign) {
          return generateSignedUrl(streamThumbnailUrl, streamConfig.tokenSecurityKey, signedUrls)
        }
      }

      return streamThumbnailUrl
    }

    return null
  }
}
