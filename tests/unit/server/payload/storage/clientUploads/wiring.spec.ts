import type { Config } from 'payload'
import { getUploadInstructions as getPayloadUploadInstructions, verifyClientUploadReceipt } from 'payload/internal'
import { describe, expect, it, vi } from 'vitest'

const { createTusUploadMock, createVideoMock } = vi.hoisted(() => ({
  createTusUploadMock: vi.fn(async () => 'https://video.bunnycdn.com/tusupload/upload-token'),
  createVideoMock: vi.fn(async () => ({ guid: 'video-guid', videoLibraryId: 1 })),
}))

vi.mock('@/server/bunny/stream.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/bunny/stream.js')>()),
  createStreamTusUpload: createTusUploadMock,
  createStreamVideo: createVideoMock,
}))

import { bunnyStorage } from '@/index.js'
import { verifyEdgeUploadUrl } from '@/server/payload/storage/clientUploads/mint.js'
import { signStreamVideoToken } from '@/server/payload/stream/tusSignature.js'

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

  it('lets Payload send storage uploads with PUT and registers no client upload handler', () => {
    const result = buildResult()
    expect(result.admin?.components?.providers ?? []).toEqual([])
    expect(Object.keys(result.admin?.dependencies ?? {})).not.toContain(
      '@seshuk/payload-storage-bunny/client#BunnyClientUploadHandler',
    )
    expect(getUploadInstructions(result)).not.toHaveProperty('adminHandler')
  })

  it('registers the deploy-edge-script CLI command', () => {
    const result = buildResult(false)
    const commands = result.cli === false ? undefined : result.cli?.commands
    expect(commands?.['bunny:deploy-edge-script']).toEqual(
      expect.stringMatching(/cli\/commands\/deployEdgeScript\.js#deployEdgeScriptCommand$/),
    )
  })

  it('creates a signed Edge URL through the registered upload instructions', async () => {
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

  it('requires a signed client upload receipt and leaves the prefix to Payload', () => {
    const withClientUploads = findMedia(buildResult())
    const withoutClientUploads = findMedia(buildResult(false))

    const instructionsOf = (collection: typeof withClientUploads) =>
      (collection?.upload as { uploadInstructions?: UploadInstructions } | undefined)?.uploadInstructions
    expect(instructionsOf(withClientUploads)?.requiresUploadReceipt).toBe(true)
    expect(instructionsOf(withoutClientUploads)?.requiresUploadReceipt).toBe(true)
    expect(withClientUploads?.hooks?.beforeChange?.length).toBe(withoutClientUploads?.hooks?.beforeChange?.length)
    expect(withClientUploads?.hooks?.beforeOperation?.length).toBe(withoutClientUploads?.hooks?.beforeOperation?.length)
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

  describe('stream client uploads', () => {
    const handlerPath = '@seshuk/payload-storage-bunny/client#BunnyClientUploadHandler'
    const buildStreamClient = (upload: Record<string, unknown>) =>
      bunnyStorage({
        collections: { media: { disablePayloadAccessControl: true } },
        stream: { apiKey: 'stream-key', hostname: 'stream.b-cdn.net', libraryId: 1, tus: true },
      } as never).init({
        collections: [{ slug: 'media', fields: [], upload: { disableLocalStorage: true, ...upload } }],
      } as unknown as Config) as Config

    it('registers the TUS client upload handler only for collections without upload.mimeTypes', () => {
      const open = buildStreamClient({})
      expect(getUploadInstructions(open)?.useInAdmin).toBe(true)
      expect(open.admin?.components?.providers).toEqual([
        expect.objectContaining({
          clientProps: expect.objectContaining({ collectionSlug: 'media' }),
          path: handlerPath,
        }),
      ])

      const restricted = buildStreamClient({ mimeTypes: ['video/*'] })
      expect(getUploadInstructions(restricted)?.useInAdmin).toBe(false)
      expect(restricted.admin?.components?.providers ?? []).toEqual([])
    })

    it('registers no TUS client upload handler when an upload transformer reads the whole video', () => {
      const build = (transformFile: boolean) =>
        bunnyStorage({
          collections: { media: { disablePayloadAccessControl: true } },
          stream: { apiKey: 'stream-key', hostname: 'stream.b-cdn.net', libraryId: 1, tus: true },
        } as never).init({
          collections: [{ slug: 'media', fields: [], upload: { disableLocalStorage: true } }],
          upload: {
            transformers: [
              { mimeTypes: ['video/*'], name: 'watermark', ...(transformFile && { transformFile: () => {} }) },
            ],
          },
        } as unknown as Config) as Config

      expect(getUploadInstructions(build(true))?.useInAdmin).toBe(false)
      expect(getUploadInstructions(build(false))?.useInAdmin).toBe(true)
    })

    it('creates the video and returns a TUS dispatch whose receipt points at the video', async () => {
      const result = buildStreamClient({})
      const req = {
        payload: {
          collections: { media: { config: findMedia(result) } },
          config: { upload: { limits: { fileSize: 5_000_000 } } },
          db: { findOne: async () => null },
          secret: 'payload-secret',
        },
        t: (key: string, vars: { filename: string }) => `${key} ${vars.filename}`,
        user: { collection: 'users', id: 'user-1' },
      }

      const instructions = await getUploadInstructions(result)!.generate({
        collectionSlug: 'media',
        filename: 'clip.mp4',
        filesize: 4096,
        mimeType: 'video/mp4',
        overrideAccess: true,
        req,
      })

      expect(instructions).toMatchObject({
        name: 'bunny',
        type: 'dispatch',
        data: {
          errorMessage: '@seshuk/payload-storage-bunny:errorUploadFileFailed clip.mp4',
          headers: { LibraryId: '1', VideoId: 'video-guid' },
          uploadUrl: 'https://video.bunnycdn.com/tusupload/upload-token',
          videoId: 'video-guid',
        },
        file: { filename: 'clip.mp4', size: 4096, uploadReference: { _objectKey: 'video-guid', prefix: '' } },
      })
      expect(createVideoMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'clip.mp4' }))
      expect(createTusUploadMock).toHaveBeenCalledWith({
        apiKey: 'stream-key',
        headers: expect.objectContaining({ LibraryId: '1', VideoId: 'video-guid' }),
        libraryId: 1,
        metadata: { filetype: 'video/mp4', title: 'clip.mp4' },
        size: 4096,
        videoId: 'video-guid',
      })
      const [{ headers: creationHeaders }] = createTusUploadMock.mock.calls[0] as unknown as [
        { headers: Record<string, string> },
      ]
      expect(Number(creationHeaders.AuthorizationExpire)).toBeGreaterThan(
        Number(instructions.data.headers.AuthorizationExpire),
      )
      expect(instructions.data.headers.AuthorizationSignature).toMatch(/^[\da-f]{64}$/)
      expect(instructions.data.videoToken).toBe(
        signStreamVideoToken({
          collection: 'media',
          libraryId: 1,
          secret: 'payload-secret',
          user: req.user as never,
          videoId: 'video-guid',
        }),
      )
      expect(
        verifyClientUploadReceipt({
          collectionSlug: 'media',
          filename: 'clip.mp4',
          req: req as never,
          signedReceipt: instructions.file.uploadReference.signedReceipt,
        }),
      ).toMatchObject({ _objectKey: 'video-guid', storageFilePath: 'video-guid/clip-original.mp4' })
    })
  })

  it('makes the file optional on create for TUS collections and adds a validate and an operation hook', () => {
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
    expect(withTus?.upload).toMatchObject({ filesRequiredOnCreate: false })
    expect(withoutTus?.upload).not.toHaveProperty('filesRequiredOnCreate')
    expect(withTus?.hooks?.beforeValidate?.length).toBe((withoutTus?.hooks?.beforeValidate?.length ?? 0) + 1)
    expect(withTus?.hooks?.beforeChange?.length).toBe(withoutTus?.hooks?.beforeChange?.length)
    expect(withTus?.hooks?.beforeOperation?.length).toBe((withoutTus?.hooks?.beforeOperation?.length ?? 0) + 1)
  })
})
