import type { Config } from 'payload'
import { describe, expect, it } from 'vitest'

import { bunnyStorage } from '@/index.js'
import { verifyEdgeUploadUrl } from '@/server/payload/storage/clientUploads/mint.js'

const edgeClientUploads = { edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'shared' } }

const buildResult = (clientUploads: false | typeof edgeClientUploads = edgeClientUploads): Config => {
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
    collections: { media: true },
    storage: {
      apiKey: 'zone-pw',
      ...(clientUploads ? { clientUploads } : {}),
      hostname: 'cdn.b-cdn.net',
      zoneName: 'zone',
    },
  })(incoming) as Config
}

const findMedia = (config: Config) => config.collections?.find((collection) => collection.slug === 'media')

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
        collections: {
          media: { config: { slug: 'media', access: { create: () => true }, upload: { mimeTypes: ['image/*'] } } },
        },
        config: { upload: { limits: { fileSize: 5_000_000 } } },
        db: { findOne: async () => null },
        secret: 'payload-secret',
      },
      user: { collection: 'users', id: 'user-1' },
    }

    const response = await endpoint!.handler(req as never)
    const json = await (response as Response).json()

    expect((response as Response).status).toBe(200)
    expect(verifyEdgeUploadUrl(json.url, 'shared').valid).toBe(true)
    expect(json.clientUploadContext.signedReceipt).toEqual(expect.any(String))
  })

  it('requires a signed client upload receipt and persists the verified prefix', () => {
    const withClientUploads = findMedia(buildResult())
    const withoutClientUploads = findMedia(buildResult(false))

    expect(
      (withClientUploads?.upload as { requiresClientUploadReceipt?: boolean } | undefined)?.requiresClientUploadReceipt,
    ).toBe(true)
    expect(
      (withoutClientUploads?.upload as { requiresClientUploadReceipt?: boolean } | undefined)
        ?.requiresClientUploadReceipt,
    ).toBe(true)
    expect(withClientUploads?.hooks?.beforeChange?.length).toBe(
      (withoutClientUploads?.hooks?.beforeChange?.length ?? 0) + 1,
    )
    expect(withClientUploads?.hooks?.beforeOperation?.length).toBe(
      (withoutClientUploads?.hooks?.beforeOperation?.length ?? 0) + 1,
    )
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

  it('applies the signed file size and MIME type on stream-only TUS collections', () => {
    const buildStream = (tus: boolean) =>
      findMedia(
        bunnyStorage({
          collections: { media: { disablePayloadAccessControl: true } },
          stream: { apiKey: 'stream-key', hostname: 'stream.b-cdn.net', libraryId: 1, tus },
        } as never)({
          collections: [{ slug: 'media', fields: [], upload: { disableLocalStorage: true } }],
        } as unknown as Config) as Config,
      )

    const withTus = buildStream(true)
    const withoutTus = buildStream(false)
    expect(withTus?.hooks?.beforeChange?.length).toBe((withoutTus?.hooks?.beforeChange?.length ?? 0) + 1)
    expect(withTus?.hooks?.beforeOperation?.length).toBe((withoutTus?.hooks?.beforeOperation?.length ?? 0) + 1)
  })
})
