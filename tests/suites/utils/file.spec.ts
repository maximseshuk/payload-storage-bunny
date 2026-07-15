import type { PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { accessMock } = vi.hoisted(() => ({
  accessMock: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  access: accessMock,
}))

const { docWithFilenameExists, fileExists, getSafeFileName } = await import('@/utils/file.js')

const buildReq = (findOne: ReturnType<typeof vi.fn>) =>
  ({
    payload: {
      db: { findOne },
    },
  }) as unknown as PayloadRequest

describe('file utils', () => {
  beforeEach(() => {
    accessMock.mockReset()
    accessMock.mockRejectedValue(new Error('ENOENT'))
  })

  describe('fileExists', () => {
    it('returns true when access resolves', async () => {
      accessMock.mockResolvedValueOnce(undefined)
      expect(await fileExists('/some/path')).toBe(true)
    })

    it('returns false when access rejects', async () => {
      accessMock.mockRejectedValueOnce(new Error('ENOENT'))
      expect(await fileExists('/missing/path')).toBe(false)
    })
  })

  describe('docWithFilenameExists', () => {
    it('returns true when a doc is found', async () => {
      const findOne = vi.fn().mockResolvedValue({ id: 'doc-1' })
      const result = await docWithFilenameExists({
        collectionSlug: 'media',
        filename: 'a.txt',
        path: '',
        req: buildReq(findOne),
      })

      expect(result).toBe(true)
      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({ collection: 'media', where: { filename: { equals: 'a.txt' } } }),
      )
    })

    it('returns false when no doc is found', async () => {
      const findOne = vi.fn().mockResolvedValue(null)
      const result = await docWithFilenameExists({
        collectionSlug: 'media',
        filename: 'a.txt',
        path: '',
        req: buildReq(findOne),
      })

      expect(result).toBe(false)
    })
  })

  describe('getSafeFileName', () => {
    it('returns the desired name unchanged when nothing collides', async () => {
      const findOne = vi.fn().mockResolvedValue(null)
      const result = await getSafeFileName({
        collectionSlug: 'media',
        desiredFilename: 'a.txt',
        req: buildReq(findOne),
        staticPath: '/static',
      })

      expect(result).toBe('a.txt')
    })

    it('increments an extensioned name (a.txt -> a-1.txt) via the db collision loop', async () => {
      const findOne = vi.fn().mockResolvedValueOnce({ id: 'doc-1' }).mockResolvedValue(null)
      const result = await getSafeFileName({
        collectionSlug: 'media',
        desiredFilename: 'a.txt',
        req: buildReq(findOne),
        staticPath: '/static',
      })

      expect(result).toBe('a-1.txt')
    })

    it('increments an already-suffixed name (a-1.txt -> a-2.txt)', async () => {
      const findOne = vi.fn().mockResolvedValueOnce({ id: 'doc-1' }).mockResolvedValue(null)
      const result = await getSafeFileName({
        collectionSlug: 'media',
        desiredFilename: 'a-1.txt',
        req: buildReq(findOne),
        staticPath: '/static',
      })

      expect(result).toBe('a-2.txt')
    })

    it('handles a name with no extension (a -> a-1.a, upstream quirk)', async () => {
      const findOne = vi.fn().mockResolvedValueOnce({ id: 'doc-1' }).mockResolvedValue(null)
      const result = await getSafeFileName({
        collectionSlug: 'media',
        desiredFilename: 'a',
        req: buildReq(findOne),
        staticPath: '/static',
      })

      expect(result).toBe('a-1.a')
    })

    it('increments when the collision comes from the filesystem branch', async () => {
      const findOne = vi.fn().mockResolvedValue(null)
      accessMock.mockResolvedValueOnce(undefined).mockRejectedValue(new Error('ENOENT'))

      const result = await getSafeFileName({
        collectionSlug: 'media',
        desiredFilename: 'a.txt',
        req: buildReq(findOne),
        staticPath: '/static',
      })

      expect(result).toBe('a-1.txt')
    })
  })
})
