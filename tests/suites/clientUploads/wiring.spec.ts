import type { Config } from 'payload'
import { describe, expect, it } from 'vitest'

import { bunnyStorage } from '@/index.js'
import { verifyEdgeUploadUrl } from '@/storage/clientUploads/edge/mint.js'

const buildResult = (): Config => {
  const incoming = {
    collections: [
      { slug: 'users', auth: true, fields: [] },
      {
        slug: 'media',
        fields: [{ name: 'alt', type: 'text' }],
        upload: { disableLocalStorage: true, mimeTypes: ['image/*'] },
      },
    ],
  } as unknown as Config

  return bunnyStorage({
    clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'shared' } },
    collections: { media: true },
    storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', zoneName: 'zone' },
  })(incoming) as Config
}

describe('client uploads plugin wiring', () => {
  it('registers the client-upload endpoint', () => {
    const result = buildResult()
    const endpoint = result.endpoints?.find((e) => e.path === '/storage-bunny/storage/upload')
    expect(endpoint).toBeDefined()
    expect(endpoint?.method).toBe('post')
  })

  it('registers the client upload handler as an admin provider and dependency', () => {
    const result = buildResult()
    const handlerPath = '@seshuk/payload-storage-bunny/client#BunnyClientUploadHandler'
    const providers = result.admin?.components?.providers ?? []
    const hasProvider = providers.some((provider) => {
      if (typeof provider === 'string') {
        return provider === handlerPath
      }
      return provider !== false && 'path' in provider && provider.path === handlerPath
    })
    expect(hasProvider).toBe(true)
    expect(result.admin?.dependencies?.[handlerPath]).toBeDefined()
  })

  it('registers the deploy-edge-script bin command', () => {
    const result = buildResult()
    expect(result.bin?.some((entry) => entry.key === 'bunny:deploy-edge-script')).toBe(true)
  })

  it('attaches the normalized config to server-only custom', () => {
    const result = buildResult()
    const pluginCustom = result.custom?.['@seshuk/payload-storage-bunny'] as { config?: { storage?: unknown } }
    expect(pluginCustom?.config?.storage).toBeDefined()
  })

  it('mints a signed edge URL through the registered endpoint', async () => {
    const result = buildResult()
    const endpoint = result.endpoints?.find((e) => e.path === '/storage-bunny/storage/upload')

    const req = {
      json: async () => ({ collectionSlug: 'media', filename: 'photo.jpg', filesize: 1000, mimeType: 'image/jpeg' }),
      payload: {
        collections: { media: { config: { slug: 'media', upload: { mimeTypes: ['image/*'] } } } },
        config: { upload: { limits: { fileSize: 5_000_000 } } },
        db: { findOne: async () => null },
      },
      user: { id: 'user-1' },
    }

    const response = await endpoint!.handler(req as never)
    const json = await (response as Response).json()

    expect((response as Response).status).toBe(200)
    expect(verifyEdgeUploadUrl(json.url, 'shared').valid).toBe(true)
  })

  it('denies unauthenticated requests through the registered endpoint', async () => {
    const result = buildResult()
    const endpoint = result.endpoints?.find((e) => e.path === '/storage-bunny/storage/upload')

    const req = {
      json: async () => ({ collectionSlug: 'media', filename: 'photo.jpg', filesize: 1000, mimeType: 'image/jpeg' }),
      payload: {
        collections: { media: { config: { slug: 'media', upload: { mimeTypes: ['image/*'] } } } },
        config: { upload: { limits: { fileSize: 5_000_000 } } },
        db: { findOne: async () => null },
      },
      user: undefined,
    }

    const response = await endpoint!.handler(req as never)
    expect((response as Response).status).toBe(403)
  })
})
