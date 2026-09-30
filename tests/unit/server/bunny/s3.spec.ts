import { beforeEach, describe, expect, it, vi } from 'vitest'

const { ctorMock, deleteObjectMock, getPresignedUrlMock, objectExistsMock, putAnyObjectMock } = vi.hoisted(() => ({
  ctorMock: vi.fn(),
  deleteObjectMock: vi.fn(),
  getPresignedUrlMock: vi.fn(),
  objectExistsMock: vi.fn(),
  putAnyObjectMock: vi.fn(),
}))

vi.mock('s3mini', () => ({
  S3mini: class {
    deleteObject = deleteObjectMock
    getPresignedUrl = getPresignedUrlMock
    objectExists = objectExistsMock
    putAnyObject = putAnyObjectMock

    constructor(args: unknown) {
      ctorMock(args)
    }
  },
}))

const { deleteStorageFileS3, getS3Endpoint, presignStoragePutUrl, storageObjectExistsS3, uploadStorageFileS3 } =
  await import('@/server/bunny/s3.js')

const credentials = {
  apiKey: 'zone-password',
  s3: { region: 'de' },
  zoneName: 'my-zone',
}

beforeEach(() => {
  ctorMock.mockReset()
  deleteObjectMock.mockReset()
  getPresignedUrlMock.mockReset()
  objectExistsMock.mockReset()
  putAnyObjectMock.mockReset()
})

describe('Storage S3 backend', () => {
  describe('getS3Endpoint', () => {
    it('builds the regional endpoint', () => {
      expect(getS3Endpoint('de')).toBe('https://de-s3.storage.bunnycdn.com')
      expect(getS3Endpoint('ny')).toBe('https://ny-s3.storage.bunnycdn.com')
    })
  })

  describe('client', () => {
    it('points the S3 client at the path-style bucket endpoint using zone credentials', async () => {
      putAnyObjectMock.mockResolvedValue({ ok: true, status: 200 })

      await uploadStorageFileS3({
        ...credentials,
        buffer: Buffer.from('data'),
        mimeType: 'image/jpeg',
        path: 'image.jpg',
      })

      expect(ctorMock).toHaveBeenCalledWith({
        accessKeyId: 'my-zone',
        endpoint: 'https://de-s3.storage.bunnycdn.com/my-zone',
        region: 'de',
        requestAbortTimeout: expect.any(Number),
        secretAccessKey: 'zone-password',
      })
    })
  })

  describe('uploadStorageFileS3', () => {
    it('uploads the buffer under the raw key and mime type', async () => {
      putAnyObjectMock.mockResolvedValue({ ok: true, status: 200 })
      const buffer = Buffer.from('data')

      await uploadStorageFileS3({
        ...credentials,
        buffer,
        mimeType: 'image/jpeg',
        path: 'nested/my image.jpg',
      })

      expect(putAnyObjectMock).toHaveBeenCalledTimes(1)
      expect(putAnyObjectMock).toHaveBeenCalledWith('nested/my image.jpg', buffer, 'image/jpeg')
    })

    it('passes the upload timeout to the client', async () => {
      putAnyObjectMock.mockResolvedValue({ ok: true, status: 200 })

      await uploadStorageFileS3({
        ...credentials,
        buffer: Buffer.from('x'),
        mimeType: 'image/jpeg',
        path: 'a.jpg',
        timeout: 90000,
      })

      expect(ctorMock.mock.calls[0][0]).toMatchObject({ requestAbortTimeout: 90000 })
    })

    it('wraps upload failures', async () => {
      putAnyObjectMock.mockRejectedValue(new Error('403 Forbidden'))

      await expect(
        uploadStorageFileS3({ ...credentials, buffer: Buffer.from('x'), mimeType: 'image/jpeg', path: 'a.jpg' }),
      ).rejects.toThrow('Unable to upload file: a.jpg')
    })
  })

  describe('deleteStorageFileS3', () => {
    it('deletes the object by key', async () => {
      deleteObjectMock.mockResolvedValue(true)

      await deleteStorageFileS3({ ...credentials, path: 'nested/image.jpg' })

      expect(deleteObjectMock).toHaveBeenCalledWith('nested/image.jpg')
    })

    it('throws when the delete is not acknowledged', async () => {
      deleteObjectMock.mockResolvedValue(false)

      await expect(deleteStorageFileS3({ ...credentials, path: 'a.jpg' })).rejects.toThrow(
        'Unable to delete file: a.jpg',
      )
    })

    it('wraps delete failures', async () => {
      deleteObjectMock.mockRejectedValue(new Error('500'))

      await expect(deleteStorageFileS3({ ...credentials, path: 'a.jpg' })).rejects.toThrow(
        'Unable to delete file: a.jpg',
      )
    })
  })

  describe('storageObjectExistsS3', () => {
    it('reports an existing object', async () => {
      objectExistsMock.mockResolvedValue(true)

      await expect(storageObjectExistsS3({ ...credentials, path: 'a.jpg' })).resolves.toBe(true)
      expect(objectExistsMock).toHaveBeenCalledWith('a.jpg')
    })

    it('reports a missing object', async () => {
      objectExistsMock.mockResolvedValue(false)

      await expect(storageObjectExistsS3({ ...credentials, path: 'a.jpg' })).resolves.toBe(false)
    })

    it('treats an inconclusive answer as existing', async () => {
      objectExistsMock.mockResolvedValue(null)

      await expect(storageObjectExistsS3({ ...credentials, path: 'a.jpg' })).resolves.toBe(true)
    })
  })

  describe('presignStoragePutUrl', () => {
    const file = { contentLength: 1234, contentType: 'image/jpeg' }
    const signedHeaders = { 'Content-Length': '1234', 'Content-Type': 'image/jpeg', 'If-None-Match': '*' }

    it('requests a presigned PUT URL with the given expiry and signed headers', async () => {
      getPresignedUrlMock.mockResolvedValue('https://de-s3.storage.bunnycdn.com/my-zone/a.jpg?X-Amz-Signature=abc')

      const url = await presignStoragePutUrl({ ...credentials, ...file, expiresIn: 900, path: 'a.jpg' })

      expect(url).toBe('https://de-s3.storage.bunnycdn.com/my-zone/a.jpg?X-Amz-Signature=abc')
      expect(getPresignedUrlMock).toHaveBeenCalledWith('PUT', 'a.jpg', 900, {}, signedHeaders)
    })

    it('defaults the expiry to 600 seconds', async () => {
      getPresignedUrlMock.mockResolvedValue('https://signed')

      await presignStoragePutUrl({ ...credentials, ...file, path: 'a.jpg' })

      expect(getPresignedUrlMock).toHaveBeenCalledWith('PUT', 'a.jpg', 600, {}, signedHeaders)
    })
  })
})
