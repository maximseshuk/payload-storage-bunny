import { beforeEach, describe, expect, it, vi } from 'vitest'

import { httpError } from '../../helpers/unit/httpError.js'

const { deleteMock, getMock, postMock, putMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
}))

vi.mock('@/utils/kyClient.js', () => ({
  kyClient: {
    delete: deleteMock,
    get: getMock,
    post: postMock,
    put: putMock,
  },
}))

const { deleteStorageFile, uploadStorageFile } = await import('@/storage/api.js')

const creds = { apiKey: 'zone-pass', region: 'de', zoneName: 'my-zone' }

beforeEach(() => {
  deleteMock.mockReset()
  putMock.mockReset()
})

describe('deleteStorageFile', () => {
  it('DELETEs the regional zone URL with Accept/AccessKey headers and default timeout', async () => {
    deleteMock.mockResolvedValue(undefined)

    await deleteStorageFile({ ...creds, path: 'nested/image.jpg' })

    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(deleteMock).toHaveBeenCalledWith('https://de.storage.bunnycdn.com/my-zone/nested/image.jpg', {
      headers: { Accept: 'application/json', AccessKey: 'zone-pass' },
      timeout: 15000,
    })
  })

  it('uses the region-less storage host when no region is given', async () => {
    deleteMock.mockResolvedValue(undefined)

    await deleteStorageFile({ apiKey: 'zone-pass', path: 'a.jpg', zoneName: 'my-zone' })

    expect(deleteMock.mock.calls[0][0]).toBe('https://storage.bunnycdn.com/my-zone/a.jpg')
  })

  it('maps a 400 HTTPError to a delete-failed message', async () => {
    deleteMock.mockRejectedValue(httpError(400))

    await expect(deleteStorageFile({ ...creds, path: 'a.jpg' })).rejects.toThrow('Bunny Storage: Delete failed')
  })

  it('falls back to the generic message for other HTTPError statuses', async () => {
    deleteMock.mockRejectedValue(httpError(401))

    await expect(deleteStorageFile({ ...creds, path: 'a.jpg' })).rejects.toThrow('Unable to delete file: a.jpg')
  })

  it('falls back to the generic message for non-HTTP errors', async () => {
    deleteMock.mockRejectedValue(new Error('boom'))

    await expect(deleteStorageFile({ ...creds, path: 'a.jpg' })).rejects.toThrow('Unable to delete file: a.jpg')
  })
})

describe('uploadStorageFile', () => {
  it('PUTs the buffer to the zone URL with Content-Type and default timeout', async () => {
    putMock.mockResolvedValue(undefined)
    const buffer = Buffer.from('data')

    await uploadStorageFile({ ...creds, buffer, mimeType: 'image/jpeg', path: 'nested/img.jpg' })

    expect(putMock).toHaveBeenCalledTimes(1)
    expect(putMock).toHaveBeenCalledWith('https://de.storage.bunnycdn.com/my-zone/nested/img.jpg', {
      body: buffer,
      headers: { Accept: 'application/json', AccessKey: 'zone-pass', 'Content-Type': 'image/jpeg' },
      timeout: 15000,
    })
  })

  it('uses the region-less host when no region is given', async () => {
    putMock.mockResolvedValue(undefined)

    await uploadStorageFile({
      apiKey: 'zone-pass',
      buffer: Buffer.from('x'),
      mimeType: 'image/jpeg',
      path: 'a.jpg',
      zoneName: 'my-zone',
    })

    expect(putMock.mock.calls[0][0]).toBe('https://storage.bunnycdn.com/my-zone/a.jpg')
  })

  it('passes an explicit timeout through', async () => {
    putMock.mockResolvedValue(undefined)

    await uploadStorageFile({
      ...creds,
      buffer: Buffer.from('x'),
      mimeType: 'image/jpeg',
      path: 'a.jpg',
      timeout: 90000,
    })

    expect(putMock.mock.calls[0][1]).toMatchObject({ timeout: 90000 })
  })

  it('maps a 400 HTTPError to an upload-failed message', async () => {
    putMock.mockRejectedValue(httpError(400))

    await expect(
      uploadStorageFile({ ...creds, buffer: Buffer.from('x'), mimeType: 'image/jpeg', path: 'a.jpg' }),
    ).rejects.toThrow('Bunny Storage: Upload failed')
  })

  it('maps a 401 HTTPError to an invalid access key message', async () => {
    putMock.mockRejectedValue(httpError(401))

    await expect(
      uploadStorageFile({ ...creds, buffer: Buffer.from('x'), mimeType: 'image/jpeg', path: 'a.jpg' }),
    ).rejects.toThrow('Bunny Storage: Invalid access key, region, or file format')
  })

  it('falls back to the generic message for other HTTPError statuses', async () => {
    putMock.mockRejectedValue(httpError(500))

    await expect(
      uploadStorageFile({ ...creds, buffer: Buffer.from('x'), mimeType: 'image/jpeg', path: 'a.jpg' }),
    ).rejects.toThrow('Unable to upload file: a.jpg')
  })

  it('falls back to the generic message for non-HTTP errors', async () => {
    putMock.mockRejectedValue(new Error('boom'))

    await expect(
      uploadStorageFile({ ...creds, buffer: Buffer.from('x'), mimeType: 'image/jpeg', path: 'a.jpg' }),
    ).rejects.toThrow('Unable to upload file: a.jpg')
  })
})
