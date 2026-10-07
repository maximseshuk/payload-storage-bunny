import type {
  CollectionAfterReadHook,
  Field,
  FieldAccess,
  GroupField,
  PayloadRequest,
  SelectFn,
  SelectIncludeType,
  TypeWithID,
} from 'payload'
import { getSelectMode } from 'payload/shared'

import { bunnyDataFieldOpenApi } from '@/server/payload/openapi.js'
import { verifyStreamVideoToken } from '@/server/payload/stream/tusSignature.js'
import { isStreamFileMimeType } from '@/shared/mimeTypes.js'
import type { BunnyDataInternal, CollectionContext, StreamVideoState } from '@/shared/types/index.js'

type StoredResolutions = {
  available?: string[]
  highest?: string
}

type StoredStream = {
  resolutions?: StoredResolutions
  status?: null | StreamVideoState
  videoId?: null | string
}

type StoredBunnyData = {
  stream?: StoredStream
}

const SERVER_STREAM_UPLOAD_CONTEXT_KEY = 'bunnyServerStreamUpload'

export const markServerStreamUpload = (req: PayloadRequest, videoId: string): void => {
  req.context ??= {}
  req.context[SERVER_STREAM_UPLOAD_CONTEXT_KEY] = videoId
}

const isServerStreamUpload: FieldAccess = ({ req, siblingData }) =>
  typeof siblingData?.videoId === 'string' && req.context?.[SERVER_STREAM_UPLOAD_CONTEXT_KEY] === siblingData.videoId

const isRestoringVersion: FieldAccess = ({ req }) => !!req.context?.isRestoringVersion

const canWriteStreamState: FieldAccess = (args) => isRestoringVersion(args) || isServerStreamUpload(args)

export const bunnyGroupField = (context: CollectionContext, status: boolean): GroupField => {
  const canWriteVideoId: FieldAccess = (args) => {
    const { req, siblingData } = args
    const videoId = siblingData?.videoId
    if (!videoId || canWriteStreamState(args)) {
      return true
    }
    return (
      !!context.streamOptions &&
      typeof videoId === 'string' &&
      verifyStreamVideoToken({
        collection: context.collection.slug,
        libraryId: context.streamOptions.libraryId,
        secret: req.payload.secret,
        token: siblingData?.videoToken,
        user: req.user,
        videoId,
      })
    )
  }

  const streamFields: Field[] = [
    {
      name: 'videoId',
      type: 'text',
      access: { create: canWriteVideoId, update: canWriteVideoId },
      index: true,
    },
    { name: 'videoToken', type: 'text', admin: { hidden: true }, virtual: true },
    {
      name: 'libraryId',
      type: 'number',
      admin: { readOnly: true },
      hooks: {
        afterRead: [
          ({ siblingData }) => {
            const videoId = (siblingData as StoredStream | undefined)?.videoId
            if (!videoId || !context.streamOptions) {
              return null
            }
            return context.streamOptions.libraryId
          },
        ],
      },
      virtual: true,
    },
  ]

  if (status) {
    streamFields.push({
      name: 'status',
      type: 'text',
      access: { create: isServerStreamUpload, update: canWriteStreamState },
      admin: { disabled: { field: true }, readOnly: true },
      index: true,
    })
  }

  if (context.streamOptions?.mp4Fallback) {
    streamFields.push({
      name: 'resolutions',
      type: 'json',
      access: { create: isServerStreamUpload, update: canWriteStreamState },
    })
  }

  return {
    name: 'bunnyData',
    type: 'group',
    admin: { hidden: true },
    custom: { openapi: bunnyDataFieldOpenApi },
    fields: [
      {
        name: 'type',
        type: 'text',
        admin: { readOnly: true },
        hooks: {
          afterRead: [
            ({ siblingData }) => {
              const videoId = (siblingData as StoredBunnyData | undefined)?.stream?.videoId
              return videoId ? 'stream' : null
            },
          ],
        },
        virtual: true,
      },
      {
        name: 'stream',
        type: 'group',
        fields: streamFields,
        hooks: { beforeValidate: [({ value }) => (value && typeof value === 'object' ? { ...value } : value)] },
      },
    ],
    jsonSchema: [
      () => ({
        oneOf: [
          {
            additionalProperties: false,
            properties: {
              stream: {
                additionalProperties: false,
                properties: {
                  libraryId: { type: 'number' },
                  resolutions: {
                    additionalProperties: false,
                    properties: {
                      available: { items: { type: 'string' }, type: 'array' },
                      highest: { type: 'string' },
                    },
                    type: 'object',
                  },
                  ...(status && {
                    status: { enum: ['failed', 'processing', 'ready', null], type: ['string', 'null'] },
                  }),
                  videoId: { type: 'string' },
                },
                required: ['videoId', 'libraryId'],
                type: 'object',
              },
              type: { const: 'stream', type: 'string' },
            },
            required: ['type', 'stream'],
            type: 'object',
          },
          { type: 'null' },
        ],
      }),
    ],
  }
}

const collapseStoredBunnyData = (target: unknown): void => {
  if (!target || typeof target !== 'object') {
    return
  }
  const record = target as { bunnyData?: null | StoredBunnyData }
  if (record.bunnyData && !record.bunnyData.stream?.videoId) {
    delete record.bunnyData
  }
}

export const getAfterReadHook = (): CollectionAfterReadHook => {
  return ({ doc }) => {
    if (!doc || typeof doc !== 'object') {
      return doc
    }
    collapseStoredBunnyData(doc)
    const variants = (doc as { variants?: unknown }).variants
    if (variants && typeof variants === 'object') {
      for (const variant of Object.values(variants as Record<string, unknown>)) {
        collapseStoredBunnyData(variant)
      }
    }
    return doc
  }
}

export const getStreamSelect = (select?: SelectFn): SelectFn => {
  return (args) => {
    const resolved = select?.(args)
    const current = resolved ?? args.select
    if (!current || getSelectMode(current) === 'exclude' || !(current as SelectIncludeType).bunnyStream) {
      return resolved
    }
    const bunnyData = (current as SelectIncludeType).bunnyData
    if (bunnyData === true) {
      return resolved
    }
    const stream = bunnyData?.stream
    if (stream === true) {
      return resolved
    }
    return {
      ...current,
      bunnyData: { ...bunnyData, stream: { ...stream, status: true, videoId: true } },
    }
  }
}

export const hasStatus = (status: unknown, value: 'draft' | 'published') =>
  status === value || (!!status && typeof status === 'object' && Object.values(status).includes(value))

export const readStoredVideo = (doc: unknown): StoredStream | undefined => {
  return (doc as { bunnyData?: StoredBunnyData } | undefined)?.bunnyData?.stream
}

export const readStreamFileVideoId = (doc: unknown, mimeTypes: readonly string[] = []): null | string | undefined => {
  if (!isStreamFileMimeType((doc as { mimeType?: unknown } | undefined)?.mimeType, mimeTypes)) {
    return undefined
  }
  return readStoredVideo(doc)?.videoId
}

export const setStoredVideoId = (
  data: Record<string, unknown>,
  videoId: null | string,
  status: null | StreamVideoState | undefined,
  resolutions?: null | StoredResolutions,
): void => {
  const bunnyData = { ...(data.bunnyData as Record<string, unknown> | undefined) }
  const stream = { ...(bunnyData.stream as Record<string, unknown> | undefined) }
  stream.videoId = videoId
  if (status !== undefined) {
    stream.status = videoId ? status : null
  }
  if (resolutions !== undefined) {
    stream.resolutions = resolutions
  }
  bunnyData.stream = stream
  data.bunnyData = bunnyData
}

export const getBunnyData = (
  doc: TypeWithID | undefined,
  filename: string,
  mimeTypes?: readonly string[],
): BunnyDataInternal | null => {
  if (!doc || typeof doc !== 'object') {
    return null
  }

  if (filename && 'filename' in doc && doc.filename !== filename) {
    return null
  }

  const videoId = readStreamFileVideoId(doc, mimeTypes)
  if (!videoId || typeof videoId !== 'string') {
    return null
  }

  return {
    stream: {
      resolutions: readStoredVideo(doc)?.resolutions,
      videoId,
    },
  }
}
