import type { FieldHook, PayloadRequest } from 'payload'

import { maybeGenerateSignedUrl } from '@/cdn/tokenAuth.js'
import { readStoredVideo } from '@/fields/bunnyGroupField.js'
import type { NormalizedThumbnailConfig } from '@/types/configNormalized.js'
import type { CollectionContext } from '@/types/index.js'
import { buildStorageCdnUrl, buildStreamCdnUrl } from '@/utils/cdnUrl.js'
import { isImage } from '@/utils/mimeTypes.js'
import { applyUrlTransform } from '@/utils/urlTransform.js'

type FieldHookArgs = {
  context: CollectionContext
  size?: { name: string }
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

export const getAdminThumbnail = (context: CollectionContext) => {
  const { collection, signedUrls, storageConfig, streamConfig, thumbnail } = context

  if (!thumbnail) {
    return undefined
  }

  return ({ doc, req: _req }: { doc: Record<string, unknown>; req: PayloadRequest }): null | string => {
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
          const internalUrl = `/api/${collection.slug}/file/${encodeURIComponent(sizeFilename)}`
          return applyTransform(thumbnail, context, doc, sizeFilename, prefix, internalUrl)
        }

        if (!storageConfig) {
          return null
        }

        const baseUrl = buildStorageCdnUrl(storageConfig.hostname, prefix, sizeFilename)
        const transformedUrl = applyTransform(thumbnail, context, doc, sizeFilename, prefix, baseUrl)
        return maybeGenerateSignedUrl(transformedUrl, {
          collection,
          filename: sizeFilename,
          signedUrls,
          tokenSecurityKey: storageConfig.tokenSecurityKey,
        })
      }
    }

    if (doc.mimeType && isImage(doc.mimeType as string) && doc.filename && typeof doc.filename === 'string') {
      const filename = doc.filename
      const prefix = typeof doc.prefix === 'string' ? doc.prefix : ''

      if (context.usePayloadAccessControl) {
        const internalUrl = `/api/${collection.slug}/file/${encodeURIComponent(filename)}`
        return applyTransform(thumbnail, context, doc, filename, prefix, internalUrl)
      }

      if (!storageConfig) {
        return null
      }

      const baseUrl = buildStorageCdnUrl(storageConfig.hostname, prefix, filename)
      const transformedUrl = applyTransform(thumbnail, context, doc, filename, prefix, baseUrl)
      return maybeGenerateSignedUrl(transformedUrl, {
        collection,
        filename,
        signedUrls,
        tokenSecurityKey: storageConfig.tokenSecurityKey,
      })
    }

    const videoId = readStoredVideo(doc)?.videoId
    if (streamConfig && videoId) {
      const isStreamAnimated = thumbnail && typeof thumbnail === 'object' && thumbnail.streamAnimated
      const thumbnailFile = isStreamAnimated ? 'preview.webp' : 'thumbnail.jpg'
      const filename = `${videoId}/${thumbnailFile}`
      const prefix = ''

      if (context.usePayloadAccessControl) {
        const internalUrl = `/api/${collection.slug}/file/${encodeURIComponent(`bunny:stream:${videoId}:${thumbnailFile}`)}`
        return applyTransform(thumbnail, context, doc, filename, prefix, internalUrl)
      }

      const baseUrl = buildStreamCdnUrl(streamConfig.hostname, videoId, thumbnailFile)
      const transformedUrl = applyTransform(thumbnail, context, doc, filename, prefix, baseUrl)
      return maybeGenerateSignedUrl(transformedUrl, {
        collection,
        filename,
        signedUrls,
        tokenSecurityKey: streamConfig.tokenSecurityKey,
      })
    }

    return null
  }
}

export const getUrlAfterReadFieldHook = ({ context, size }: FieldHookArgs): FieldHook => {
  return ({ data, value }) => {
    const filename = size ? data?.sizes?.[size.name]?.filename : data?.filename
    const prefix = data?.prefix
    let url = value

    if (context.usePayloadAccessControl && context.urlTransform && url && typeof url === 'string') {
      url = applyUrlTransform({
        collection: context.collection,
        config: context.urlTransform,
        data,
        filename: filename || '',
        prefix: prefix || '',
        url,
      })
    }

    return url
  }
}

export const getThumbnailURLAfterReadFieldHook = ({ context }: FieldHookArgs): FieldHook => {
  const adminThumbnailFn = getAdminThumbnail(context)

  return ({ originalDoc, req }) => {
    if (!adminThumbnailFn || !originalDoc) {
      return null
    }

    return adminThumbnailFn({ doc: originalDoc, req })
  }
}
