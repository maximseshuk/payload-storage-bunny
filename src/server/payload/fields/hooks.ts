import type { FieldHook, PayloadRequest } from 'payload'

import { readStreamFileVideoId } from '@/server/payload/fields/bunnyGroupField.js'
import { getGenerateUrl } from '@/server/payload/storage/generateUrl.js'
import { maybeGenerateSignedUrl } from '@/server/payload/tokenAuth.js'
import { buildStorageCdnUrl, buildStreamCdnUrl, getObjectFolder } from '@/server/urls.js'
import { isImage } from '@/shared/mimeTypes.js'
import type { CollectionContext } from '@/shared/types/index.js'
import type { NormalizedThumbnailOptions } from '@/shared/types/optionsNormalized.js'
import { applyUrlTransform } from '@/shared/urlTransform.js'

type FieldHookArgs = {
  context: CollectionContext
  size?: { name: string }
}

const applyTransform = (
  options: false | NormalizedThumbnailOptions | undefined,
  context: CollectionContext,
  doc: Record<string, unknown>,
  filename: string,
  prefix: string,
  url: string,
): string => {
  if (!options) {
    return url
  }

  const { sizeName: _sizeName, ...optionsWithoutSizeName } = options
  return applyUrlTransform({
    collection: context.collection,
    options: optionsWithoutSizeName,
    data: doc,
    filename,
    prefix,
    url,
  })
}

export const getAdminThumbnail = (
  context: CollectionContext,
): ((args: { doc: Record<string, unknown>; req: PayloadRequest }) => null | string) | undefined => {
  const { collection, signedUrls, storageOptions, streamOptions, thumbnail } = context

  if (!thumbnail) {
    return undefined
  }

  return ({ doc, req }: { doc: Record<string, unknown>; req: PayloadRequest }): null | string => {
    if (
      thumbnail &&
      typeof thumbnail === 'object' &&
      thumbnail.sizeName &&
      doc.variants &&
      typeof doc.variants === 'object' &&
      doc.variants !== null
    ) {
      const variants = doc.variants as Record<string, { filename?: string }>
      const requestedSize = variants[thumbnail.sizeName]

      if (requestedSize && requestedSize.filename && typeof requestedSize.filename === 'string') {
        const sizeFilename = requestedSize.filename
        const prefix = getObjectFolder(doc, requestedSize)

        if (context.usePayloadAccessControl) {
          const internalUrl = `${req.payload.config.routes.api}/${collection.slug}/file/${encodeURIComponent(sizeFilename)}`
          return applyTransform(thumbnail, context, doc, sizeFilename, prefix, internalUrl)
        }

        if (!storageOptions) {
          return null
        }

        const baseUrl = buildStorageCdnUrl({
          collectionPrefix: context.prefix,
          filename: sizeFilename,
          hostname: storageOptions.hostname,
          prefix,
        })
        const transformedUrl = applyTransform(thumbnail, context, doc, sizeFilename, prefix, baseUrl)
        return maybeGenerateSignedUrl(transformedUrl, {
          collection,
          filename: sizeFilename,
          req,
          signedUrls,
          tokenSecurityKey: storageOptions.tokenSecurityKey,
        })
      }
    }

    if (doc.mimeType && isImage(doc.mimeType as string) && doc.filename && typeof doc.filename === 'string') {
      const filename = doc.filename
      const prefix = getObjectFolder(doc)

      if (context.usePayloadAccessControl) {
        const internalUrl = `${req.payload.config.routes.api}/${collection.slug}/file/${encodeURIComponent(filename)}`
        return applyTransform(thumbnail, context, doc, filename, prefix, internalUrl)
      }

      if (!storageOptions) {
        return null
      }

      const baseUrl = buildStorageCdnUrl({
        collectionPrefix: context.prefix,
        filename,
        hostname: storageOptions.hostname,
        prefix,
      })
      const transformedUrl = applyTransform(thumbnail, context, doc, filename, prefix, baseUrl)
      return maybeGenerateSignedUrl(transformedUrl, {
        collection,
        filename,
        req,
        signedUrls,
        tokenSecurityKey: storageOptions.tokenSecurityKey,
      })
    }

    const videoId = readStreamFileVideoId(doc, streamOptions?.mimeTypes)
    if (streamOptions && videoId) {
      const isStreamAnimated = thumbnail && typeof thumbnail === 'object' && thumbnail.streamAnimated
      const thumbnailFile = isStreamAnimated ? 'preview.webp' : 'thumbnail.jpg'
      const filename = `${videoId}/${thumbnailFile}`
      const prefix = ''

      if (context.usePayloadAccessControl) {
        if (doc.id === undefined || doc.id === null) {
          return null
        }
        const internalUrl = `${req.payload.config.routes.api}/storage-bunny/stream/thumbnail/${collection.slug}/${encodeURIComponent(String(doc.id))}/${encodeURIComponent(videoId)}/${thumbnailFile}`
        return applyTransform(thumbnail, context, doc, filename, prefix, internalUrl)
      }

      const baseUrl = buildStreamCdnUrl(streamOptions.hostname, videoId, thumbnailFile)
      const transformedUrl = applyTransform(thumbnail, context, doc, filename, prefix, baseUrl)
      return maybeGenerateSignedUrl(transformedUrl, {
        collection,
        filename,
        req,
        signedUrls,
        tokenSecurityKey: streamOptions.tokenSecurityKey,
      })
    }

    return null
  }
}

export const getUrlAfterReadFieldHook = ({ context, size }: FieldHookArgs): FieldHook => {
  return ({ data, req, value }) => {
    const filename = size ? data?.variants?.[size.name]?.filename : data?.filename
    const prefix = getObjectFolder(data, size ? data?.variants?.[size.name] : data)
    let url = value

    if (!context.usePayloadAccessControl && !context.hasGenerateFileURL && context.signedUrls?.userIp && filename) {
      return getGenerateUrl(context)({
        collection: context.collection,
        data,
        filename,
        prefix: prefix || '',
        req,
      })
    }

    if (context.usePayloadAccessControl && context.urlTransform && url && typeof url === 'string') {
      url = applyUrlTransform({
        collection: context.collection,
        options: context.urlTransform,
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
