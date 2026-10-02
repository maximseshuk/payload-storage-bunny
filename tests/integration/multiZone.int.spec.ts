import path from 'node:path'

import { createLocalReq, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cleanupStreamVideos } from '../helpers/e2e/bunnyStream.js'
import { getPayload } from '../helpers/int/getPayload.js'
import { hasBunnyCredentials, hasSignedBunnyCredentials } from '../helpers/shared/credentials.js'

const globalStorageHost = process.env.BUNNY_STORAGE_HOSTNAME || ''
const signedStorageHost = process.env.BUNNY_SIGNED_STORAGE_HOSTNAME || ''

describe.skipIf(!(hasBunnyCredentials() && hasSignedBunnyCredentials()))('Multi-zone', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload('multiZone')
  })

  afterAll(async () => {
    await cleanupStreamVideos('mz-stream-signed clip', { envPrefix: 'SIGNED' })
    await cleanupStreamVideos('mz-stream-global clip')
    await payload.destroy()
  })

  const uploadImage = async (collection: 'mz-storage-global' | 'mz-storage-signed') => {
    const doc = await payload.create({
      collection,
      data: { alt: `multi-zone ${collection}` },
      filePath: path.resolve(import.meta.dirname, '../fixtures/test-image.jpg'),
      overrideAccess: true,
    })
    const response = await fetch(doc.url as string)
    await response.body?.cancel()
    await payload.delete({ id: doc.id, collection, overrideAccess: true })
    return { status: response.status, url: doc.url as string }
  }

  it('serves each storage collection from its own zone', async () => {
    const global = await uploadImage('mz-storage-global')
    expect(global.url).toContain(globalStorageHost)
    expect(global.url).not.toContain(signedStorageHost)
    expect(global.url).not.toContain('token=')
    expect(global.status).toBe(200)

    const signed = await uploadImage('mz-storage-signed')
    expect(signed.url).toContain(signedStorageHost)
    expect(signed.url).not.toContain(globalStorageHost)
    expect(signed.url).toContain('token=')
    expect(signed.url).toContain('expires=')
    expect(signed.status).toBe(200)
  })

  it('mints tus-auth against each collection stream library', async () => {
    const endpoint = payload.config.endpoints?.find((e) => e.path === '/storage-bunny/stream/tus-auth')
    if (!endpoint) {
      throw new Error('tus-auth endpoint not found')
    }
    const {
      docs: [user],
    } = await payload.find({ collection: 'users', limit: 1, overrideAccess: true })

    const requestTusAuth = async (collection: string) => {
      const body = {
        collection,
        filename: `${collection}.mp4`,
        filesize: 1024,
        filetype: 'video/mp4',
        title: `${collection} clip`,
      }
      const req = await createLocalReq(
        { req: { json: async () => body }, user: { ...user, collection: 'users' } },
        payload,
      )
      const response = await endpoint.handler(req)
      expect(response.status).toBe(200)
      return response.json()
    }

    const signed = await requestTusAuth('mz-stream-signed')
    expect(signed.type).toBe('upload')
    expect(signed.libraryId).toBe(parseInt(process.env.BUNNY_SIGNED_STREAM_LIBRARY_ID || '0', 10))
    expect(signed.videoId).toBeTruthy()
    expect(signed.authorizationSignature).toMatch(/^[a-f0-9]{64}$/)
    expect(typeof signed.authorizationExpire).toBe('number')

    const global = await requestTusAuth('mz-stream-global')
    expect(global.type).toBe('upload')
    expect(global.libraryId).toBe(parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0', 10))
    expect(global.authorizationSignature).toMatch(/^[a-f0-9]{64}$/)
  })
})
