import type { CollectionAfterReadHook, Field, GroupField, TypeWithID } from 'payload'

import { bunnyDataFieldOpenApi } from '@/server/payload/openapi.js'
import type { BunnyDataInternal, CollectionContext } from '@/shared/types/index.js'

type StoredResolutions = {
  available?: string[]
  highest?: string
}

type StoredStream = {
  resolutions?: StoredResolutions
  videoId?: null | string
}

type StoredBunnyData = {
  stream?: StoredStream
}

export const bunnyGroupField = (context: CollectionContext): GroupField => {
  const streamFields: Field[] = [
    { name: 'videoId', type: 'text', index: true },
    {
      name: 'libraryId',
      type: 'number',
      admin: { readOnly: true },
      hooks: {
        afterRead: [
          ({ siblingData }) => {
            const videoId = (siblingData as StoredStream | undefined)?.videoId
            if (!videoId || !context.streamConfig) {
              return null
            }
            return context.streamConfig.libraryId
          },
        ],
      },
      virtual: true,
    },
  ]

  if (context.streamConfig?.mp4Fallback) {
    streamFields.push({ name: 'resolutions', type: 'json' })
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
      { name: 'stream', type: 'group', fields: streamFields },
    ],
    typescriptSchema: [
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
    record.bunnyData = null
  }
}

export const getAfterReadHook = (): CollectionAfterReadHook => {
  return ({ doc }) => {
    if (!doc || typeof doc !== 'object') {
      return doc
    }
    collapseStoredBunnyData(doc)
    const sizes = (doc as { sizes?: unknown }).sizes
    if (sizes && typeof sizes === 'object') {
      for (const size of Object.values(sizes as Record<string, unknown>)) {
        collapseStoredBunnyData(size)
      }
    }
    return doc
  }
}

export const readStoredVideo = (doc: unknown): StoredStream | undefined => {
  return (doc as { bunnyData?: StoredBunnyData } | undefined)?.bunnyData?.stream
}

export const setStoredVideoId = (data: Record<string, unknown>, videoId: null | string): void => {
  const bunnyData = (data.bunnyData as Record<string, unknown> | undefined) ?? {}
  const stream = (bunnyData.stream as Record<string, unknown> | undefined) ?? {}
  stream.videoId = videoId
  bunnyData.stream = stream
  data.bunnyData = bunnyData
}

export const getBunnyData = (doc: TypeWithID | undefined, filename: string): BunnyDataInternal | null => {
  if (!doc || typeof doc !== 'object') {
    return null
  }

  if (filename && 'filename' in doc && doc.filename !== filename) {
    return null
  }

  const stored = readStoredVideo(doc)
  if (!stored?.videoId || typeof stored.videoId !== 'string') {
    return null
  }

  return {
    stream: {
      resolutions: stored.resolutions,
      videoId: stored.videoId,
    },
  }
}
