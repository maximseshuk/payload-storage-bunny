import type { TypeWithID } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  bunnyGroupField,
  getBunnyData,
  getAfterReadHook,
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

    it('skips the filename check when filename arg is empty', () => {
      const doc = { filename: 'whatever.mp4', bunnyData: { stream: { videoId: 'v1' } } } as unknown as TypeWithID
      expect(getBunnyData(doc, '')).toEqual({ stream: { resolutions: undefined, videoId: 'v1' } })
    })
  })

  describe('setStoredVideoId / readStoredVideo', () => {
    it('round-trips a videoId through an empty object', () => {
      const data: Record<string, unknown> = {}
      setStoredVideoId(data, 'v42')
      expect(readStoredVideo(data)?.videoId).toBe('v42')
    })

    it('preserves existing stream fields when setting videoId', () => {
      const data: Record<string, unknown> = {
        bunnyData: { stream: { resolutions: { highest: '1080p' } } },
      }
      setStoredVideoId(data, 'v7')
      const stored = readStoredVideo(data)
      expect(stored?.videoId).toBe('v7')
      expect(stored?.resolutions).toEqual({ highest: '1080p' })
    })

    it('returns undefined for an undefined doc', () => {
      expect(readStoredVideo(undefined)).toBeUndefined()
    })
  })

  describe('field afterRead hooks', () => {
    it("resolves the virtual type field to 'stream' or null", () => {
      const field = bunnyGroupField(context({ libraryId: 12345 } as never)) as any
      const hook = findField(field, 'type').hooks.afterRead[0]

      expect(hook({ siblingData: { stream: { videoId: 'v1' } } })).toBe('stream')
      expect(hook({ siblingData: { stream: {} } })).toBeNull()
      expect(hook({ siblingData: undefined })).toBeNull()
    })

    it('resolves the virtual libraryId field to the configured library when a videoId exists', () => {
      const field = bunnyGroupField(context({ libraryId: 999 } as never)) as any
      const streamGroup = findField(field, 'stream')
      const hook = findField(streamGroup, 'libraryId').hooks.afterRead[0]

      expect(hook({ siblingData: { videoId: 'v1' } })).toBe(999)
      expect(hook({ siblingData: {} })).toBeNull()
    })

    it('resolves the virtual libraryId field to null without a streamOptions', () => {
      const field = bunnyGroupField(context(undefined)) as any
      const streamGroup = findField(field, 'stream')
      const hook = findField(streamGroup, 'libraryId').hooks.afterRead[0]

      expect(hook({ siblingData: { videoId: 'v1' } })).toBeNull()
    })
  })

  describe('resolutions field toggling', () => {
    it('adds the resolutions field only when mp4Fallback is enabled', () => {
      const withFallback = bunnyGroupField(context({ libraryId: 1, mp4Fallback: true } as never)) as any
      const withoutFallback = bunnyGroupField(context({ libraryId: 1, mp4Fallback: false } as never)) as any

      expect(findField(findField(withFallback, 'stream'), 'resolutions')).toBeDefined()
      expect(findField(findField(withoutFallback, 'stream'), 'resolutions')).toBeUndefined()
    })
  })

  describe('stream field access', () => {
    const streamContext = {
      collection: { slug: 'media' },
      streamOptions: { libraryId: 12345, mp4Fallback: true },
    } as unknown as CollectionContext
    const req = { payload: { secret: 'payload-secret' }, user: editor }
    const streamGroup = findField(bunnyGroupField(streamContext), 'stream')
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
      const field = bunnyGroupField({ collection: { slug: 'media' } } as unknown as CollectionContext)
      const noStreamVideoId = findField(findField(field, 'stream'), 'videoId')
      const siblingData = { videoId: 'v1', videoToken: tokenFor('v1') }
      expect(noStreamVideoId.access.create({ req, siblingData })).toBe(false)
    })

    it('does not accept resolutions from create or update input', () => {
      const resolutions = findField(streamGroup, 'resolutions')
      expect(resolutions.access.create()).toBe(false)
      expect(resolutions.access.update()).toBe(false)
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
})
