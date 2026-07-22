import type { TypeWithID } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  bunnyGroupField,
  getBunnyData,
  getAfterReadHook,
  readStoredVideo,
  setStoredVideoId,
} from '@/fields/bunnyGroupField.js'
import type { CollectionContext } from '@/types/index.js'

const context = (streamConfig?: Partial<CollectionContext['streamConfig']>): CollectionContext =>
  ({ streamConfig: streamConfig as CollectionContext['streamConfig'] }) as CollectionContext

/* eslint-disable @typescript-eslint/no-explicit-any */
const findField = (field: any, name: string) => field.fields.find((f: any) => f.name === name)
const run = (doc: any) => (getAfterReadHook() as any)({ doc })

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

    it('can null out the videoId', () => {
      const data: Record<string, unknown> = {}
      setStoredVideoId(data, null)
      expect(readStoredVideo(data)?.videoId).toBeNull()
    })

    it('returns undefined for an undefined doc', () => {
      expect(readStoredVideo(undefined)).toBeUndefined()
    })
  })

  describe('field afterRead hooks', () => {
    it("type virtual resolves to 'stream' or null", () => {
      const field = bunnyGroupField(context({ libraryId: 12345 } as never)) as any
      const hook = findField(field, 'type').hooks.afterRead[0]

      expect(hook({ siblingData: { stream: { videoId: 'v1' } } })).toBe('stream')
      expect(hook({ siblingData: { stream: {} } })).toBeNull()
      expect(hook({ siblingData: undefined })).toBeNull()
    })

    it('libraryId virtual resolves to the configured library when a videoId exists', () => {
      const field = bunnyGroupField(context({ libraryId: 999 } as never)) as any
      const streamGroup = findField(field, 'stream')
      const hook = findField(streamGroup, 'libraryId').hooks.afterRead[0]

      expect(hook({ siblingData: { videoId: 'v1' } })).toBe(999)
      expect(hook({ siblingData: {} })).toBeNull()
    })

    it('libraryId virtual resolves to null when streamConfig is absent', () => {
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

  describe('getAfterReadHook', () => {
    it('collapses bunnyData to null when there is no videoId', () => {
      expect(run({ bunnyData: { type: null, stream: { videoId: null, libraryId: null } } }).bunnyData).toBeNull()
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
      expect(result.sizes.thumbnail.bunnyData).toBeNull()
    })

    it('leaves docs without bunnyData untouched', () => {
      expect(run({ title: 'x' })).toEqual({ title: 'x' })
      expect(run(null)).toBeNull()
    })
  })
})
