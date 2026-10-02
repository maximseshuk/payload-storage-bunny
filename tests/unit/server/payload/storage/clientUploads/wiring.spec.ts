import type { Config } from 'payload'
import { getUploadInstructions as getPayloadUploadInstructions } from 'payload/internal'
import { describe, expect, it, vi } from 'vitest'

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
  }).init(incoming) as Config
}

const photo = { collectionSlug: 'media', filename: 'photo.jpg', filesize: 1000, mimeType: 'image/jpeg' }

const findMedia = (config: Config) => config.collections?.find((collection) => collection.slug === 'media')

type UploadInstructions = {
  generate: (args: Record<string, unknown>) => Promise<any>
  requiresUploadReceipt?: boolean
  useInAdmin: boolean
}

const getUploadInstructions = (config: Config) =>
  (findMedia(config)?.upload as { uploadInstructions?: UploadInstructions } | undefined)?.uploadInstructions

describe('client uploads plugin wiring', () => {
  it('serves client uploads through Payload upload instructions in the admin', () => {
    const result = buildResult()
    expect(getUploadInstructions(result)?.useInAdmin).toBe(true)
    expect(getUploadInstructions(buildResult(false))?.useInAdmin).toBe(false)
    expect(result.endpoints?.some((e) => e.path?.startsWith('/storage-bunny/storage/upload'))).toBe(false)
    expect(
      (result.custom?.['@seshuk/payload-storage-bunny'] as { config?: { storage?: unknown } })?.config?.storage,
    ).toBeDefined()
  })

  it('lets Payload PUT storage uploads and keeps the client handler as an admin dependency', () => {
    const result = buildResult()
    const handlerPath = '@seshuk/payload-storage-bunny/client#BunnyClientUploadHandler'
    const providers = result.admin?.components?.providers ?? []
    const hasProvider = providers.some(
      (provider) =>
        typeof provider === 'object' && provider !== null && 'path' in provider && provider.path === handlerPath,
    )
    expect(hasProvider).toBe(false)
    expect(result.admin?.dependencies?.[handlerPath]).toBeDefined()
    expect(buildResult(false).admin?.dependencies?.[handlerPath]).toBeDefined()
  })

  it('registers the deploy-edge-script CLI command', () => {
    const result = buildResult(false)
    const commands = result.cli === false ? undefined : result.cli?.commands
    expect(commands?.['bunny:deploy-edge-script']).toEqual(
      expect.stringMatching(/cli\/commands\/deployEdgeScript\.js#deployEdgeScriptCommand$/),
    )
  })

  it('mints a signed edge URL through the registered upload instructions', async () => {
    const result = buildResult()

    const req = {
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

    const instructions = await getUploadInstructions(result)!.generate({ ...photo, req })

    expect(instructions.type).toBe('http')
    expect(verifyEdgeUploadUrl(instructions.request.url, 'shared').valid).toBe(true)
    expect(instructions.file.uploadReference.signedReceipt).toEqual(expect.any(String))
  })

  it('requires a signed client upload receipt and persists the verified prefix', () => {
    const withClientUploads = findMedia(buildResult())
    const withoutClientUploads = findMedia(buildResult(false))

    const instructionsOf = (collection: typeof withClientUploads) =>
      (collection?.upload as { uploadInstructions?: UploadInstructions } | undefined)?.uploadInstructions
    expect(instructionsOf(withClientUploads)?.requiresUploadReceipt).toBe(true)
    expect(instructionsOf(withoutClientUploads)?.requiresUploadReceipt).toBe(true)
    expect(withClientUploads?.hooks?.beforeChange?.length).toBe(
      (withoutClientUploads?.hooks?.beforeChange?.length ?? 0) + 1,
    )
    expect(withClientUploads?.hooks?.beforeOperation?.length).toBe(
      (withoutClientUploads?.hooks?.beforeOperation?.length ?? 0) + 1,
    )
  })

  it('runs the default access check before a custom access callback, which can only narrow access', async () => {
    const access = vi.fn(() => true)
    const media = findMedia(buildResult({ ...edgeClientUploads, access } as never))
    const req = {
      payload: {
        collections: { media: { config: { ...media, access: { create: () => true, update: () => true } } } },
        config: { upload: { limits: { fileSize: 5_000_000 } } },
        db: { findOne: async () => null },
        secret: 'payload-secret',
      },
      t: (key: string) => key,
      user: undefined,
    }

    await expect(getPayloadUploadInstructions({ ...photo, req } as never)).rejects.toMatchObject({ status: 403 })
    expect(access).not.toHaveBeenCalled()
  })

  it('applies the signed file size and MIME type on stream-only TUS collections', () => {
    const buildStream = (tus: boolean) =>
      findMedia(
        bunnyStorage({
          collections: { media: { disablePayloadAccessControl: true } },
          stream: { apiKey: 'stream-key', hostname: 'stream.b-cdn.net', libraryId: 1, tus },
        } as never).init({
          collections: [{ slug: 'media', fields: [], upload: { disableLocalStorage: true } }],
        } as unknown as Config) as Config,
      )

    const withTus = buildStream(true)
    const withoutTus = buildStream(false)
    expect(withTus?.hooks?.beforeChange?.length).toBe((withoutTus?.hooks?.beforeChange?.length ?? 0) + 1)
    expect(withTus?.hooks?.beforeOperation?.length).toBe((withoutTus?.hooks?.beforeOperation?.length ?? 0) + 1)
  })
})
