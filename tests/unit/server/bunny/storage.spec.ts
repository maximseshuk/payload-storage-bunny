import { beforeEach, describe, expect, it, vi } from 'vitest'

import { httpError } from '../../../helpers/unit/httpError.js'

const { kyMethods, mockKy } = await vi.hoisted(() => import('../../../helpers/unit/kyMock.js'))
vi.mock('ky', mockKy)

const { delete: deleteMock, get: getMock, put: putMock } = kyMethods

const { copyStorageFile, deleteStorageFile, uploadStorageFile } = await import('@/server/bunny/storage.js')

const creds = { apiKey: 'zone-pass', region: 'ny', zoneName: 'my-zone' }

beforeEach(() => {
  deleteMock.mockReset()
  getMock.mockReset()
  putMock.mockReset()
})

describe('deleteStorageFile', () => {
  it('sends a DELETE to the regional zone URL with Accept and AccessKey headers and the default timeout', async () => {
    deleteMock.mockResolvedValue(undefined)

    await deleteStorageFile({ ...creds, path: 'nested/image.jpg' })

    expect(deleteMock).toHaveBeenCalledExactlyOnceWith('https://ny.storage.bunnycdn.com/my-zone/nested/image.jpg', {
      headers: { Accept: 'application/json', AccessKey: 'zone-pass' },
      timeout: 15000,
    })
  })

  it('uses the region-less storage host for the de region', async () => {
    deleteMock.mockResolvedValue(undefined)

    await deleteStorageFile({ apiKey: 'zone-pass', path: 'a.jpg', region: 'de', zoneName: 'my-zone' })

    expect(deleteMock.mock.calls[0][0]).toBe('https://storage.bunnycdn.com/my-zone/a.jpg')
  })

  it.each([
    [400, 'Bunny Storage: Delete failed'],
    [401, 'Unable to delete file: a.jpg'],
  ])('maps a %i HTTPError to "%s"', async (status, message) => {
    deleteMock.mockRejectedValue(httpError(status))

    await expect(deleteStorageFile({ ...creds, path: 'a.jpg' })).rejects.toThrow(message)
  })

  it('treats a missing object as deleted', async () => {
    deleteMock.mockRejectedValue(httpError(404))

    await expect(deleteStorageFile({ ...creds, path: 'a.jpg' })).resolves.toBeUndefined()
  })
})

describe('copyStorageFile', () => {
  it('streams the source into the target with its Content-Type when the target is free', async () => {
    const body = new ReadableStream()
    getMock
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(body, { headers: { 'content-type': 'image/png' } }))
    putMock.mockResolvedValue(undefined)

    await copyStorageFile({ ...creds, from: 'a/old.png', timeout: 60000, to: 'b/new.png' })

    expect(getMock.mock.calls.map(([url]) => url)).toEqual([
      'https://ny.storage.bunnycdn.com/my-zone/b/new.png',
      'https://ny.storage.bunnycdn.com/my-zone/a/old.png',
    ])
    expect(putMock).toHaveBeenCalledWith('https://ny.storage.bunnycdn.com/my-zone/b/new.png', {
      body,
      headers: { AccessKey: 'zone-pass', Accept: 'application/json', 'Content-Type': 'image/png' },
      timeout: 60000,
    })
  })

  it('throws EEXIST without reading the source when the target exists', async () => {
    getMock.mockResolvedValueOnce(new Response('x'))

    await expect(copyStorageFile({ ...creds, from: 'a.png', to: 'b.png' })).rejects.toMatchObject({
      code: 'EEXIST',
      message: 'Storage destination already exists',
    })
    expect(getMock).toHaveBeenCalledTimes(1)
    expect(putMock).not.toHaveBeenCalled()
  })

  it('checks the target with a one-byte ranged GET and does not wait for its body', async () => {
    const hangingBody = new ReadableStream({
      cancel: () => new Promise<void>(() => {}),
      pull: () => new Promise(() => {}),
    })
    getMock.mockResolvedValueOnce(new Response(hangingBody, { status: 206 }))

    await expect(copyStorageFile({ ...creds, from: 'a.png', to: 'b.png' })).rejects.toMatchObject({ code: 'EEXIST' })
    expect(getMock).toHaveBeenCalledWith('https://ny.storage.bunnycdn.com/my-zone/b.png', {
      headers: { AccessKey: 'zone-pass', Range: 'bytes=0-0' },
      throwHttpErrors: false,
      timeout: 15000,
    })
  })

  it('throws when the target check fails', async () => {
    getMock.mockResolvedValueOnce(new Response(null, { status: 500 }))

    await expect(copyStorageFile({ ...creds, from: 'a.png', to: 'b.png' })).rejects.toThrow(
      'Unable to read file: b.png (500)',
    )
    expect(putMock).not.toHaveBeenCalled()
  })
})

describe('uploadStorageFile', () => {
  it('sends a PUT with the buffer to the zone URL with Content-Type and the default timeout', async () => {
    putMock.mockResolvedValue(undefined)
    const buffer = Buffer.from('data')

    await uploadStorageFile({ ...creds, buffer, mimeType: 'image/jpeg', path: 'nested/img.jpg' })

    expect(putMock).toHaveBeenCalledExactlyOnceWith('https://ny.storage.bunnycdn.com/my-zone/nested/img.jpg', {
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

  it.each([
    [400, 'Bunny Storage: Upload failed'],
    [401, 'Bunny Storage: Invalid access key, region, or file format'],
    [500, 'Unable to upload file: a.jpg'],
  ])('maps a %i HTTPError to "%s"', async (status, message) => {
    putMock.mockRejectedValue(httpError(status))

    await expect(
      uploadStorageFile({ ...creds, buffer: Buffer.from('x'), mimeType: 'image/jpeg', path: 'a.jpg' }),
    ).rejects.toThrow(message)
  })
})
