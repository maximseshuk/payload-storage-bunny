import { posix } from 'node:path'

import { resolveSignedURLKey } from '@payloadcms/plugin-cloud-storage/utilities'
import type { TFunction } from '@payloadcms/translations'
import type { GenerateUploadInstructions, PayloadRequest, SanitizedCollectionConfig } from 'payload'
import { APIError, Forbidden } from 'payload'
import { assertClientUploadAccess, assertClientUploadAllowed, createClientUploadReceipt } from 'payload/internal'
import sanitize from 'sanitize-filename'

import { presignStoragePutUrl } from '@/server/bunny/s3.js'
import { signStreamVideoToken } from '@/server/payload/stream/tusSignature.js'
import {
  createStreamTusUploadSession,
  hasStreamClientUploads,
  hasStreamTusAccess,
} from '@/server/payload/stream/tusUpload.js'
import { isRestrictedFileType, matchesMimeTypePattern } from '@/shared/mimeTypes.js'
import type { PluginStorageBunnyTranslationsKeys } from '@/shared/translations/index.js'
import type { CollectionContext, StreamTusUploadData } from '@/shared/types/index.js'

import { mintEdgeUploadUrl } from './mint.js'

type AssertClientUploadFileArgs = {
  collection: SanitizedCollectionConfig
  filename: string
  filesize: number
  mimeType: string
  req: PayloadRequest
}

export const assertClientUploadFile = ({
  collection,
  filename,
  filesize,
  mimeType,
  req,
}: AssertClientUploadFileArgs): void => {
  if (!Number.isSafeInteger(filesize) || filesize < 0) {
    throw new APIError('Invalid file size', 400)
  }
  assertClientUploadAllowed({ collection, filename, mimeType })

  const allowRestrictedFileTypes = typeof collection.upload === 'object' && collection.upload.allowRestrictedFileTypes
  if (!allowRestrictedFileTypes && isRestrictedFileType(sanitize(filename), mimeType)) {
    throw new APIError(`File type "${mimeType}" is not allowed`, 415)
  }

  const allowedMimeTypes = typeof collection.upload === 'object' ? collection.upload.mimeTypes : undefined
  if (
    Array.isArray(allowedMimeTypes) &&
    allowedMimeTypes.length > 0 &&
    !allowedMimeTypes.some((pattern) => matchesMimeTypePattern(mimeType, pattern))
  ) {
    throw new APIError(`File type "${mimeType}" is not allowed`, 415)
  }

  const sizeLimit = req.payload.config.upload?.limits?.fileSize
  if (typeof sizeLimit === 'number' && filesize > sizeLimit) {
    throw new APIError('File exceeds the configured size limit', 413)
  }
}

export const getGenerateUploadInstructions =
  (context: CollectionContext): GenerateUploadInstructions =>
  async ({ collectionSlug, filename, filesize, mimeType, overrideAccess, req }) => {
    const collection = req.payload.collections?.[collectionSlug]?.config
    if (!collection) {
      throw new APIError(`Unknown collection "${collectionSlug}"`, 404)
    }

    const { storageOptions: storage, streamOptions } = context
    const clientUploads = storage?.clientUploads
    const docPrefix = async () =>
      clientUploads?.prefix ? await clientUploads.prefix({ collectionSlug, req }) : undefined

    if (
      streamOptions?.tus &&
      hasStreamClientUploads(context, req.payload.config.upload.transformers) &&
      streamOptions.mimeTypes.some((pattern) => matchesMimeTypePattern(mimeType, pattern))
    ) {
      if (
        !overrideAccess &&
        !(await hasStreamTusAccess({
          data: { collection: collectionSlug, filename, filesize, filetype: mimeType },
          req,
          streamOptions,
        }))
      ) {
        throw new Forbidden(req.t)
      }
      assertClientUploadFile({ collection, filename, filesize, mimeType, req })

      const { sanitizedDocPrefix, sanitizedFilename, storageFilePath } = await resolveSignedURLKey({
        collectionPrefix: context.prefix,
        collectionSlug,
        docPrefix: await docPrefix(),
        filename,
        req,
      })
      const { expiresIn, headers, uploadUrl, videoId } = await createStreamTusUploadSession({
        filesize,
        filetype: mimeType,
        req,
        streamOptions,
        title: sanitizedFilename,
      })
      const data: StreamTusUploadData = {
        errorMessage: (req.t as unknown as TFunction<PluginStorageBunnyTranslationsKeys>)(
          '@seshuk/payload-storage-bunny:errorUploadFileFailed',
          { filename: sanitizedFilename },
        ),
        expiresIn,
        headers,
        uploadUrl,
        videoId,
        videoToken: signStreamVideoToken({
          collection: collectionSlug,
          libraryId: streamOptions.libraryId,
          secret: req.payload.secret,
          user: req.user,
          videoId,
        }),
      }

      return {
        name: 'bunny',
        type: 'dispatch',
        data,
        file: {
          filename: sanitizedFilename,
          mimeType,
          size: filesize,
          uploadReference: {
            _objectKey: videoId,
            prefix: sanitizedDocPrefix,
            signedReceipt: createClientUploadReceipt({
              _objectKey: videoId,
              collectionSlug,
              filename: sanitizedFilename,
              filePrefix: sanitizedDocPrefix,
              req,
              storageFilePath: posix.join(
                posix.dirname(posix.dirname(storageFilePath)),
                videoId,
                posix.basename(storageFilePath),
              ),
            }),
          },
        },
      }
    }

    if (!storage || !clientUploads) {
      throw new APIError(`Client uploads are not enabled for "${collectionSlug}"`, 403)
    }

    if (!overrideAccess) {
      const hasAccess = clientUploads.access
        ? await clientUploads.access({ collectionSlug, req })
        : await assertClientUploadAccess({ collectionSlug, req }).then(
            () => true,
            () => false,
          )
      if (!hasAccess) {
        throw new Forbidden(req.t)
      }
    }

    if (streamOptions?.mimeTypes.some((pattern) => matchesMimeTypePattern(mimeType, pattern))) {
      throw new APIError(`File type "${mimeType}" uploads to Bunny Stream, not through client uploads`, 400)
    }

    assertClientUploadFile({ collection, filename, filesize, mimeType, req })

    if (!storage.s3 && clientUploads.edge && filesize > clientUploads.edge.maxSize) {
      throw new APIError('File exceeds the configured size limit', 413)
    }

    const {
      sanitizedFilename,
      storageFilePath: path,
      uploadReference,
    } = await resolveSignedURLKey({
      collectionPrefix: context.prefix,
      collectionSlug,
      docPrefix: await docPrefix(),
      filename,
      req,
    })

    let url: string
    const headers: Record<string, string> = { 'Content-Type': mimeType }
    if (storage.s3) {
      url = await presignStoragePutUrl({
        apiKey: storage.apiKey,
        contentLength: filesize,
        contentType: mimeType,
        path,
        region: storage.region,
        zoneName: storage.zoneName,
      })
      headers['If-None-Match'] = '*'
    } else {
      if (!clientUploads.edge) {
        throw new APIError('Edge uploads are not configured for this collection', 500)
      }
      url = mintEdgeUploadUrl({
        maxSize: clientUploads.edge.maxSize,
        path,
        scriptUrl: clientUploads.edge.scriptUrl,
        secret: clientUploads.edge.secret,
        size: filesize,
        type: mimeType,
        zoneName: storage.zoneName,
      })
    }

    return {
      type: 'http',
      file: { filename: sanitizedFilename, mimeType, size: filesize, uploadReference },
      request: { headers, method: 'PUT', url },
    }
  }
