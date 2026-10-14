import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createNormalizedOptions } from '@/server/payload/options/normalizer.js'
import { getLibraryCollectionSlugs, isVideoReferenced } from '@/server/payload/stream/references.js'

import { createBaseStream, createOwnStream } from '../../../../helpers/unit/optionsBuilders.js'
import { buildStreamReq } from '../../../../helpers/unit/stream.js'

const findOneMock = vi.fn()
const findVersionsMock = vi.fn()

const buildReq = (collections: Record<string, Record<string, unknown>>) =>
  buildStreamReq({ collections, payload: { db: { findOne: findOneMock, findVersions: findVersionsMock } } })

const docWhere = { 'bunnyData.stream.videoId': { equals: 'video-1' } }
const versionWhere = { 'version.bunnyData.stream.videoId': { equals: 'video-1' } }

describe('getLibraryCollectionSlugs', () => {
  const options = createNormalizedOptions({
    collections: {
      clips: { disablePayloadAccessControl: true },
      images: { disablePayloadAccessControl: true, stream: false },
      media: { disablePayloadAccessControl: true },
      own: { disablePayloadAccessControl: true, stream: createOwnStream(999) },
      shared: { disablePayloadAccessControl: true, stream: createOwnStream(12345) },
    },
    stream: createBaseStream(),
  } as never)

  it('returns every collection on the same library, own overrides included', () => {
    expect(getLibraryCollectionSlugs(options, 'media', 12345)).toEqual(['media', 'clips', 'shared'])
  })

  it('leaves out a collection with its own library when searching another library', () => {
    expect(getLibraryCollectionSlugs(options, 'media', 12345)).not.toContain('own')
  })

  it('returns only the collections on an own library', () => {
    expect(getLibraryCollectionSlugs(options, 'own', 999)).toEqual(['own'])
  })

  it('always includes the current collection, even without stream options', () => {
    expect(getLibraryCollectionSlugs(options, 'images', 12345)).toEqual(['images', 'clips', 'media', 'shared'])
  })

  it('returns only the current collection when no collection uses the library', () => {
    expect(getLibraryCollectionSlugs(options, 'media', 777)).toEqual(['media'])
  })
})

describe('isVideoReferenced', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findOneMock.mockResolvedValue(null)
    findVersionsMock.mockResolvedValue({ docs: [] })
  })

  it('returns false and checks every collection when no document or version uses the video', async () => {
    const req = buildReq({ clips: { versions: { drafts: true } }, media: {} })

    await expect(isVideoReferenced({ collectionSlugs: ['media', 'clips'], req, videoId: 'video-1' })).resolves.toBe(
      false,
    )
    expect(findOneMock).toHaveBeenCalledTimes(2)
    expect(findOneMock).toHaveBeenCalledWith({ collection: 'media', req, where: docWhere })
    expect(findOneMock).toHaveBeenCalledWith({ collection: 'clips', req, where: docWhere })
    expect(findVersionsMock).toHaveBeenCalledExactlyOnceWith({
      collection: 'clips',
      limit: 1,
      pagination: false,
      req,
      where: versionWhere,
    })
  })

  it('returns true when a document uses the video and stops searching', async () => {
    findOneMock.mockResolvedValueOnce({ id: 'doc-1' })
    const req = buildReq({ clips: {}, media: { versions: { drafts: true } } })

    await expect(isVideoReferenced({ collectionSlugs: ['media', 'clips'], req, videoId: 'video-1' })).resolves.toBe(
      true,
    )
    expect(findOneMock).toHaveBeenCalledOnce()
    expect(findVersionsMock).not.toHaveBeenCalled()
  })

  it('returns true when only a version uses the video', async () => {
    findVersionsMock.mockResolvedValue({ docs: [{ id: 'version-1' }] })
    const req = buildReq({ media: { versions: { drafts: true } } })

    await expect(isVideoReferenced({ collectionSlugs: ['media'], req, videoId: 'video-1' })).resolves.toBe(true)
  })

  it('does not search versions of a collection without versions', async () => {
    findVersionsMock.mockResolvedValue({ docs: [{ id: 'version-1' }] })
    const req = buildReq({ media: {} })

    await expect(isVideoReferenced({ collectionSlugs: ['media'], req, videoId: 'video-1' })).resolves.toBe(false)
    expect(findVersionsMock).not.toHaveBeenCalled()
  })

  it('returns true when another collection on the same library uses the video', async () => {
    findOneMock.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === 'clips' ? { id: 'clip-1' } : null,
    )
    const req = buildReq({ clips: {}, media: {} })

    await expect(isVideoReferenced({ collectionSlugs: ['media', 'clips'], req, videoId: 'video-1' })).resolves.toBe(
      true,
    )
  })

  it('skips a slug that Payload does not know', async () => {
    const req = buildReq({ media: {} })

    await expect(isVideoReferenced({ collectionSlugs: ['ghost', 'media'], req, videoId: 'video-1' })).resolves.toBe(
      false,
    )
    expect(findOneMock).toHaveBeenCalledExactlyOnceWith({ collection: 'media', req, where: docWhere })
  })

  it('excludes the current document and its versions only in its own collection', async () => {
    const req = buildReq({ clips: { versions: { drafts: true } }, media: { versions: { drafts: true } } })

    await isVideoReferenced({
      collectionSlugs: ['media', 'clips'],
      except: { collection: 'media', id: 'doc-1' },
      req,
      videoId: 'video-1',
    })

    expect(findOneMock).toHaveBeenCalledWith({
      collection: 'media',
      req,
      where: { and: [docWhere, { id: { not_equals: 'doc-1' } }] },
    })
    expect(findVersionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'media',
        where: { and: [versionWhere, { parent: { not_equals: 'doc-1' } }] },
      }),
    )
    expect(findOneMock).toHaveBeenCalledWith({ collection: 'clips', req, where: docWhere })
    expect(findVersionsMock).toHaveBeenCalledWith(expect.objectContaining({ collection: 'clips', where: versionWhere }))
  })

  it('does not search a collection with its own library for a video of another library', async () => {
    const options = createNormalizedOptions({
      collections: {
        media: { disablePayloadAccessControl: true },
        own: { disablePayloadAccessControl: true, stream: createOwnStream(999) },
      },
      stream: createBaseStream(),
    } as never)
    findOneMock.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === 'own' ? { id: 'own-1' } : null,
    )
    const req = buildReq({ media: {}, own: {} })

    await expect(
      isVideoReferenced({
        collectionSlugs: getLibraryCollectionSlugs(options, 'media', 12345),
        req,
        videoId: 'video-1',
      }),
    ).resolves.toBe(false)
    expect(findOneMock).not.toHaveBeenCalledWith(expect.objectContaining({ collection: 'own' }))
  })

  it('ignores versions of the current document', async () => {
    findVersionsMock.mockImplementation(async ({ where }: { where: unknown }) => ({
      docs: JSON.stringify(where).includes('not_equals') ? [] : [{ id: 'version-1' }],
    }))
    const req = buildReq({ media: { versions: { drafts: true } } })

    await expect(
      isVideoReferenced({
        collectionSlugs: ['media'],
        except: { collection: 'media', id: 'doc-1' },
        req,
        videoId: 'video-1',
      }),
    ).resolves.toBe(false)
  })
})
