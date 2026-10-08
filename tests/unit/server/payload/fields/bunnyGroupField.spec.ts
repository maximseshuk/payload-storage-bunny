import type { TypeWithID } from 'payload'
import { beforeValidateTraverseFields } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  bunnyGroupField,
  getBunnyData,
  getAfterReadHook,
  getStreamSelect,
  readStoredVideo,
  setStoredVideoId,
} from '@/server/payload/fields/bunnyGroupField.js'
import { signStreamVideoToken } from '@/server/payload/stream/tusSignature.js'
import type { CollectionContext } from '@/shared/types/index.js'

const context = (streamOptions?: Partial<CollectionContext['streamOptions']>): CollectionContext =>
  ({ streamOptions: streamOptions as CollectionContext['streamOptions'] }) as CollectionContext

/* eslint-disable @typescript-eslint/no-explicit-any */
const findField = (field: any, name: string) => field.fields.find((f: any) => f.name === name)
const run = (doc: any) => (getAfterReadHook() as any)({ doc })
const editor = { collection: 'users', id: 'user-1' }
const tokenFor = (videoId: string, collection = 'media', user: unknown = editor) =>
  signStreamVideoToken({ collection, libraryId: 12345, secret: 'payload-secret', user: user as never, videoId })

describe('bunnyGroupField', () => {
  describe('getBunnyData', () => {
    it('returns null when the doc is undefined', () => {
      expect(getBunnyData(undefined, 'a.mp4')).toBeNull()
    })

    it('returns null when the doc is not an object', () => {
      expect(getBunnyData('nope' as unknown as TypeWithID, 'a.mp4')).toBeNull()
    })

    it('returns null when the filename does not match', () => {
      const doc = { filename: 'other.mp4', bunnyData: { stream: { videoId: 'v1' } } } as unknown as TypeWithID
      expect(getBunnyData(doc, 'a.mp4')).toBeNull()
    })

    it('returns null when videoId is missing', () => {
      const doc = { filename: 'a.mp4', bunnyData: { stream: {} } } as unknown as TypeWithID
      expect(getBunnyData(doc, 'a.mp4')).toBeNull()
    })

    it('returns null when videoId is not a string', () => {
      const doc = { filename: 'a.mp4', bunnyData: { stream: { videoId: 123 } } } as unknown as TypeWithID
      expect(getBunnyData(doc, 'a.mp4')).toBeNull()
    })

    it('returns the stream payload for a valid doc', () => {
      const doc = {
        filename: 'a.mp4',
        bunnyData: { stream: { resolutions: { available: ['720p'], highest: '720p' }, videoId: 'v1' } },
      } as unknown as TypeWithID

      expect(getBunnyData(doc, 'a.mp4')).toEqual({
        stream: { resolutions: { available: ['720p'], highest: '720p' }, videoId: 'v1' },
      })
    })

    it('returns null when a stale videoId remains on an image', () => {
      const doc = { filename: 'photo.jpg', bunnyData: { stream: { videoId: 'v1' } }, mimeType: 'image/jpeg' }
      expect(getBunnyData(doc as unknown as TypeWithID, 'photo.jpg', ['video/*'])).toBeNull()
    })

    it.each([
      ['application/mxf', ['application/mxf']],
      ['video/mp4', ['video/webm']],
      ['audio/mpeg', []],
      ['', ['video/*']],
    ])('keeps the video of a "%s" file', (mimeType, mimeTypes) => {
      const doc = { filename: 'a', bunnyData: { stream: { videoId: 'v1' } }, mimeType }
      expect(getBunnyData(doc as unknown as TypeWithID, 'a', mimeTypes)).toEqual({
        stream: { resolutions: undefined, videoId: 'v1' },
      })
    })

    it('skips the filename check when filename arg is empty', () => {
      const doc = { filename: 'whatever.mp4', bunnyData: { stream: { videoId: 'v1' } } } as unknown as TypeWithID
      expect(getBunnyData(doc, '')).toEqual({ stream: { resolutions: undefined, videoId: 'v1' } })
    })
  })

  describe('setStoredVideoId / readStoredVideo', () => {
    it('round-trips a videoId through an empty object', () => {
      const data: Record<string, unknown> = {}
      setStoredVideoId(data, 'v42', 'processing')
      expect(readStoredVideo(data)).toEqual({ status: 'processing', videoId: 'v42' })
    })

    it('clears the status when the videoId is cleared', () => {
      const data: Record<string, unknown> = { bunnyData: { stream: { status: 'ready', videoId: 'v1' } } }
      setStoredVideoId(data, null, 'ready')
      expect(readStoredVideo(data)).toEqual({ status: null, videoId: null })
    })

    it('leaves the stream object it replaces untouched, because Payload can share it with the original doc', () => {
      const stream = { status: 'ready', videoId: 'v1' }
      const data: Record<string, unknown> = { bunnyData: { stream } }
      setStoredVideoId(data, null, null)
      expect(stream).toEqual({ status: 'ready', videoId: 'v1' })
      expect(readStoredVideo(data)).toEqual({ status: null, videoId: null })
    })

    it('preserves existing stream fields when setting videoId', () => {
      const data: Record<string, unknown> = {
        bunnyData: { stream: { resolutions: { highest: '1080p' } } },
      }
      setStoredVideoId(data, 'v7', 'ready')
      const stored = readStoredVideo(data)
      expect(stored?.videoId).toBe('v7')
      expect(stored?.resolutions).toEqual({ highest: '1080p' })
    })

    it('leaves the status untouched when no status is passed', () => {
      const data: Record<string, unknown> = {}
      setStoredVideoId(data, 'v42', undefined)
      expect(readStoredVideo(data)).toEqual({ videoId: 'v42' })
    })

    it('returns undefined for an undefined doc', () => {
      expect(readStoredVideo(undefined)).toBeUndefined()
    })
  })

  describe('field afterRead hooks', () => {
    it("resolves the virtual type field to 'stream' or null", () => {
      const field = bunnyGroupField(context({ libraryId: 12345 } as never), true) as any
      const hook = findField(field, 'type').hooks.afterRead[0]

      expect(hook({ siblingData: { stream: { videoId: 'v1' } } })).toBe('stream')
      expect(hook({ siblingData: { stream: {} } })).toBeNull()
      expect(hook({ siblingData: undefined })).toBeNull()
    })

    it('resolves the virtual libraryId field to the configured library when a videoId exists', () => {
      const field = bunnyGroupField(context({ libraryId: 999 } as never), true) as any
      const streamGroup = findField(field, 'stream')
      const hook = findField(streamGroup, 'libraryId').hooks.afterRead[0]

      expect(hook({ siblingData: { videoId: 'v1' } })).toBe(999)
      expect(hook({ siblingData: {} })).toBeNull()
    })

    it('resolves the virtual libraryId field to null without a streamOptions', () => {
      const field = bunnyGroupField(context(undefined), true) as any
      const streamGroup = findField(field, 'stream')
      const hook = findField(streamGroup, 'libraryId').hooks.afterRead[0]

      expect(hook({ siblingData: { videoId: 'v1' } })).toBeNull()
    })
  })

  describe('resolutions field toggling', () => {
    it('adds the resolutions field only when mp4Fallback is enabled', () => {
      const withFallback = bunnyGroupField(context({ libraryId: 1, mp4Fallback: true } as never), true) as any
      const withoutFallback = bunnyGroupField(context({ libraryId: 1, mp4Fallback: false } as never), true) as any

      expect(findField(findField(withFallback, 'stream'), 'resolutions')).toBeDefined()
      expect(findField(findField(withoutFallback, 'stream'), 'resolutions')).toBeUndefined()
    })
  })

  describe('status field toggling', () => {
    const schemaStream = (field: any) => field.jsonSchema[0]().oneOf[0].properties.stream.properties

    it('adds an indexed status field that allows null in the JSON schema', () => {
      const field = bunnyGroupField(context({ libraryId: 1 } as never), true) as any

      expect(findField(findField(field, 'stream'), 'status')).toMatchObject({ type: 'text', index: true })
      expect(schemaStream(field).status).toEqual({
        enum: ['failed', 'processing', 'ready', null],
        type: ['string', 'null'],
      })
    })

    it('leaves the status field and its schema out when status is off', () => {
      const field = bunnyGroupField(context({ libraryId: 1 } as never), false) as any

      expect(findField(findField(field, 'stream'), 'status')).toBeUndefined()
      expect(findField(findField(field, 'stream'), 'videoId')).toMatchObject({ index: true })
      expect(schemaStream(field).status).toBeUndefined()
    })
  })

  describe('stream field access', () => {
    const streamContext = {
      collection: { slug: 'media' },
      streamOptions: { libraryId: 12345, mp4Fallback: true },
    } as unknown as CollectionContext
    const req = { payload: { secret: 'payload-secret' }, user: editor }
    const streamGroup = findField(bunnyGroupField(streamContext, true), 'stream')
    const videoId = findField(streamGroup, 'videoId')

    it('adds a hidden virtual videoToken field', () => {
      expect(findField(streamGroup, 'videoToken')).toMatchObject({ admin: { hidden: true }, virtual: true })
    })

    it('accepts a videoId written with its video token', () => {
      const siblingData = { videoId: 'v1', videoToken: tokenFor('v1') }
      expect(videoId.access.create({ req, siblingData })).toBe(true)
      expect(videoId.access.update({ req, siblingData })).toBe(true)
    })

    it('accepts an empty videoId without a token', () => {
      expect(videoId.access.create({ req, siblingData: { videoId: null } })).toBe(true)
      expect(videoId.access.update({ req, siblingData: {} })).toBe(true)
      expect(videoId.access.update({ req })).toBe(true)
    })

    it.each([
      ['no token', undefined],
      ['a forged token', 'f'.repeat(64)],
      ['a token for another video', tokenFor('v2')],
      ['a token for another collection', tokenFor('v1', 'other')],
      ['a token for another user', tokenFor('v1', 'media', { collection: 'users', id: 'user-2' })],
    ])('rejects a videoId written with %s', (_label, videoToken) => {
      const siblingData = { videoId: 'v1', videoToken }
      expect(videoId.access.create({ req, siblingData })).toBe(false)
      expect(videoId.access.update({ req, siblingData })).toBe(false)
    })

    it('rejects a videoId written with an expired token', () => {
      vi.useFakeTimers()
      const siblingData = { videoId: 'v1', videoToken: tokenFor('v1') }
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 1000)
      expect(videoId.access.create({ req, siblingData })).toBe(true)
      vi.advanceTimersByTime(2000)
      expect(videoId.access.create({ req, siblingData })).toBe(false)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('rejects a videoId when the collection has no stream options', () => {
      const field = bunnyGroupField({ collection: { slug: 'media' } } as unknown as CollectionContext, true)
      const noStreamVideoId = findField(findField(field, 'stream'), 'videoId')
      const siblingData = { videoId: 'v1', videoToken: tokenFor('v1') }
      expect(noStreamVideoId.access.create({ req, siblingData })).toBe(false)
    })

    it.each(['resolutions', 'status'])('does not accept %s from create or update input', (name) => {
      const field = findField(streamGroup, name)
      expect(field.access.create()).toBe(false)
      expect(field.access.update()).toBe(false)
    })

    const validate = async (data: Record<string, any>, doc: Record<string, any>) => {
      await beforeValidateTraverseFields({
        id: 1,
        collection: null,
        context: {},
        data,
        doc,
        fields: [{ name: 'alt', type: 'text' }, bunnyGroupField(streamContext, true)],
        global: null,
        operation: 'update',
        overrideAccess: false,
        parentIndexPath: '',
        parentPath: '',
        parentSchemaPath: '',
        req: { ...req, context: {}, t: (key: string) => key } as never,
        siblingData: data,
        siblingDoc: doc,
      })
      return data
    }
    const stored = () => ({
      alt: 'a',
      bunnyData: { stream: { resolutions: { available: ['720p'] }, status: 'ready', videoId: 'v-old' } },
      id: 1,
    })

    it('keeps the stored video when an update with access control does not send bunnyData', async () => {
      const doc = stored()
      const data = await validate({ alt: 'b' }, doc)

      expect(data.bunnyData.stream).toMatchObject(stored().bunnyData.stream)
      expect(doc).toEqual(stored())
    })

    it('clears the videoId when an update with access control sets it to null', async () => {
      const data = await validate({ bunnyData: { stream: { videoId: null } } }, stored())

      expect(data.bunnyData.stream.videoId).toBeNull()
    })
  })

  describe('getAfterReadHook', () => {
    it('removes bunnyData when there is no videoId', () => {
      expect(run({ bunnyData: { type: null, stream: { videoId: null, libraryId: null } } }).bunnyData).toBeUndefined()
    })

    it('keeps bunnyData when a videoId is present', () => {
      const bunnyData = { type: 'stream', stream: { videoId: 'v1', libraryId: 9 } }
      expect(run({ bunnyData }).bunnyData).toBe(bunnyData)
    })

    it('collapses nested sizes[].bunnyData', () => {
      const result = run({
        bunnyData: { stream: { videoId: 'v1' } },
        sizes: { thumbnail: { bunnyData: { stream: { videoId: null } } } },
      })
      expect(result.sizes.thumbnail.bunnyData).toBeUndefined()
    })

    it('leaves docs without bunnyData untouched', () => {
      expect(run({ title: 'x' })).toEqual({ title: 'x' })
      expect(run(null)).toBeNull()
    })
  })

  describe('getStreamSelect', () => {
    const args = (select?: any) => ({ operation: 'read' as const, req: {} as any, select })

    it('adds bunnyData.stream status and videoId when bunnyStream is selected', () => {
      expect(getStreamSelect()(args({ bunnyStream: true, filename: true }))).toEqual({
        bunnyData: { stream: { status: true, videoId: true } },
        bunnyStream: true,
        filename: true,
      })
    })

    it('merges into a partial bunnyData select', () => {
      expect(getStreamSelect()(args({ bunnyData: { stream: { resolutions: true } }, bunnyStream: true }))).toEqual({
        bunnyData: { stream: { resolutions: true, status: true, videoId: true } },
        bunnyStream: true,
      })
    })

    it('leaves a select that already includes the stream unchanged', () => {
      expect(getStreamSelect()(args({ bunnyData: true, bunnyStream: true }))).toBeUndefined()
      expect(getStreamSelect()(args({ bunnyData: { stream: true }, bunnyStream: true }))).toBeUndefined()
    })

    it('leaves a select without bunnyStream unchanged', () => {
      expect(getStreamSelect()(args({ filename: true }))).toBeUndefined()
      expect(getStreamSelect()(args({ bunnyData: { stream: { resolutions: true } } }))).toBeUndefined()
    })

    it('leaves an undefined, empty or exclude select unchanged', () => {
      expect(getStreamSelect()(args())).toBeUndefined()
      expect(getStreamSelect()(args({}))).toBeUndefined()
      expect(getStreamSelect()(args({ alt: false }))).toBeUndefined()
      expect(getStreamSelect()(args({ bunnyData: false }))).toBeUndefined()
    })

    it('chains the collection select function', () => {
      const select = vi.fn().mockReturnValue({ bunnyStream: true, title: true })
      const input = args({ filename: true })
      expect(getStreamSelect(select)(input)).toEqual({
        bunnyData: { stream: { status: true, videoId: true } },
        bunnyStream: true,
        title: true,
      })
      expect(select).toHaveBeenCalledWith(input)
    })

    it('keeps the result of the collection select function when nothing needs adding', () => {
      const excluded = { bunnyData: false as const }
      expect(getStreamSelect(() => excluded)(args({ filename: true }))).toBe(excluded)
      expect(getStreamSelect(() => undefined)(args())).toBeUndefined()
    })
  })
})
