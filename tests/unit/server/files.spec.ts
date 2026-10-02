import type { PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { accessMock } = vi.hoisted(() => ({
  accessMock: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  access: accessMock,
}))

const { docWithFilenameExists, getSafeFileName } = await import('@/server/files.js')

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

    it.each([
      ['a.txt', 'a-1.txt'],
      ['a-1.txt', 'a-2.txt'],
      ['a', 'a-1'],
      ['.env', '.env-1'],
    ])('increments %s to %s after a db collision', async (desiredFilename, expected) => {
      const findOne = vi.fn().mockResolvedValueOnce({ id: 'doc-1' }).mockResolvedValue(null)
      const result = await getSafeFileName({
        collectionSlug: 'media',
        desiredFilename,
        req: buildReq(findOne),
        staticPath: '/static',
      })

      expect(result).toBe(expected)
    })

    it('never probes the filesystem root when the static path is empty', async () => {
      const findOne = vi.fn().mockResolvedValue(null)
      accessMock.mockResolvedValueOnce(undefined)

      const result = await getSafeFileName({
        collectionSlug: 'media',
        desiredFilename: 'etc',
        req: buildReq(findOne),
        staticPath: '',
      })

      expect(result).toBe('etc')
      expect(accessMock).not.toHaveBeenCalled()
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
