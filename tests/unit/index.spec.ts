import type { CollectionConfig, Config } from 'payload'
import { describe, expect, it, vi } from 'vitest'

const { streamBeforeChangeHook } = vi.hoisted(() => ({ streamBeforeChangeHook: vi.fn() }))

vi.mock('@/server/payload/stream/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/payload/stream/hooks.js')>()),
  getStreamBeforeChangeHook: () => streamBeforeChangeHook,
}))

import { bunnyStorage } from '@/index.js'
import type { BunnyStorageOptions } from '@/shared/types/index.js'

import { initPlugin } from '../helpers/unit/initPlugin.js'

type MediaOptions = BunnyStorageOptions['collections'][string]

type UploadInstructions = {
  generate: (args: Record<string, unknown>) => Promise<unknown>
  useInAdmin: boolean
}

const buildMediaUpload = (media: MediaOptions, options: Partial<BunnyStorageOptions> = {}): Record<string, unknown> => {
  const result = initPlugin(
    {
      collections: { media },
      storage: {
        apiKey: 'zone-pw',
        hostname: 'cdn.b-cdn.net',
        tokenSecurityKey: 'security-key',
        zoneName: 'zone',
      },
      ...options,
    },
    [{ slug: 'media', fields: [], upload: { disableLocalStorage: true } }],
  )

  const collection = result.collections?.find((entry) => entry.slug === 'media')

  return collection?.upload as Record<string, unknown>
}

describe('upload.cacheTags wiring', () => {
  it('disables cache tags for direct CDN URLs signed by Bunny', () => {
    const upload = buildMediaUpload({ disablePayloadAccessControl: true }, { signedUrls: true })

    expect(upload.cacheTags).toBe(false)
  })

  it('keeps cache tags when signed URLs are served through the Payload handler', () => {
    const upload = buildMediaUpload(true, { signedUrls: true })

    expect(upload.cacheTags).toBeUndefined()
  })

  it('keeps cache tags when nothing signs the URL', () => {
    const upload = buildMediaUpload({ disablePayloadAccessControl: true })

    expect(upload.cacheTags).toBeUndefined()
  })

  it('disables cache tags when the thumbnail appends its own timestamp', () => {
    const upload = buildMediaUpload(true, { thumbnail: true })

    expect(upload.cacheTags).toBe(false)
  })
})

describe('upload instructions wiring', () => {
  it('refuses client upload instructions for a stream-only TUS collection', async () => {
    const result = initPlugin(
      {
        collections: { media: { disablePayloadAccessControl: true, storage: false } },
        storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', s3: true, zoneName: 'zone' },
        stream: { apiKey: 'stream-key', hostname: 'vz.b-cdn.net', libraryId: 1, mp4Fallback: true, tus: true },
      },
      [{ slug: 'media', fields: [], upload: { mimeTypes: ['video/*', 'image/*'] } }],
    )
    const media = result.collections!.find((entry) => entry.slug === 'media')!
    const req = {
      payload: { collections: { media: { config: media } }, config: { upload: {} } },
      t: (key: string) => key,
    }

    await expect(
      (media.upload as { uploadInstructions: UploadInstructions }).uploadInstructions.generate({
        collectionSlug: 'media',
        filename: 'clip.mp4',
        filesize: 1000,
        mimeType: 'video/mp4',
        overrideAccess: true,
        req,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe('schema when the plugin is disabled', () => {
  const fieldNames = (enabled: boolean): string[] => {
    const result = initPlugin(
      {
        collections: { media: { prefix: 'media' } },
        enabled,
        storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', zoneName: 'zone' },
      },
      [
        { slug: 'media', fields: [], upload: { variants: [{ name: 'thumb', width: 100 }] } },
        { slug: 'posts', fields: [] },
      ],
    )

    expect(result.collections?.find((entry) => entry.slug === 'posts')?.fields).toEqual([])

    return (result.collections?.find((entry) => entry.slug === 'media')?.fields ?? []).flatMap((field) =>
      'name' in field ? [field.name] : [],
    )
  }

  const initDisabled = (media: MediaOptions) =>
    initPlugin(
      {
        collections: { media },
        enabled: false,
        storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', zoneName: 'zone' },
      },
      [{ slug: 'media', fields: [], upload: true }],
    )

  it('inserts the prefix and object key fields', () => {
    const fields = fieldNames(false)

    expect(fields).toEqual(expect.arrayContaining(['prefix', '_objectKey', 'url', 'variants']))
  })

  it('keeps the same storage columns as the enabled plugin', () => {
    const storageFields = ['prefix', '_objectKey', 'url', 'variants']

    expect(fieldNames(false).filter((name) => storageFields.includes(name))).toEqual(
      fieldNames(true).filter((name) => storageFields.includes(name)),
    )
  })

  it('defaults the prefix to the collection prefix', () => {
    const result = initDisabled({ prefix: 'media' })
    const prefix = result.collections?.[0]?.fields.find((field) => 'name' in field && field.name === 'prefix')

    expect(prefix).toMatchObject({ type: 'text', defaultValue: 'media' })
  })

  it('does not wire the adapter, hooks or plugin options', () => {
    const result = initDisabled(true)

    expect(result.collections?.[0]?.upload).toBe(true)
    expect(result.collections?.[0]?.hooks).toBeUndefined()
    expect(result.custom).toBeUndefined()
  })
})

describe('collections set to false', () => {
  const incoming = () =>
    ({
      collections: [
        { slug: 'media', fields: [], upload: true },
        { slug: 'docs', fields: [], upload: true },
      ],
    }) as unknown as Config

  it.each([true, false])('leaves the collection untouched when the plugin enabled is %s', (enabled) => {
    const plugin = bunnyStorage({
      collections: { docs: false, media: true },
      enabled,
      storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', zoneName: 'zone' },
    })
    const result = plugin.init(incoming()) as Config
    const docs = result.collections?.find((entry) => entry.slug === 'docs')

    expect(plugin.collections).toEqual(['media'])
    expect(docs?.upload).toBe(true)
    expect(docs?.fields).toEqual([])
  })
})

describe('removed options', () => {
  const init = (options: Record<string, unknown>, enabled = true) =>
    initPlugin(
      {
        collections: { media: true },
        enabled,
        storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', zoneName: 'zone' },
        ...options,
      },
      [{ slug: 'media', fields: [], upload: true }],
    )
  const stream = { apiKey: 'a', hostname: 'h', libraryId: 1 }

  it.each([
    [{ apiKey: 'key' }, 'apiKey was renamed to accountApiKey'],
    [
      { i18n: { translations: {} } },
      "i18n was removed, use Payload's i18n.translations['@seshuk/payload-storage-bunny']",
    ],
    [{ telemetry: { endpoint: 'https://x' } }, 'telemetry.endpoint was renamed to telemetry.url'],
    [{ adminThumbnail: 'thumbnail' }, 'adminThumbnail was renamed to thumbnail'],
    [{ purge: { apiKey: 'key' } }, 'purge.apiKey was removed, use the top-level accountApiKey'],
    [
      { urlTransform: { transformUrl: () => '' } },
      'urlTransform.transformUrl was removed, use urlTransform: (args) => url',
    ],
    [
      { thumbnail: { appendTimestamp: true } },
      'thumbnail.appendTimestamp was renamed to thumbnail.urlTransform.appendTimestamp',
    ],
    [
      { thumbnail: { queryParams: { v: '1' } } },
      'thumbnail.queryParams was renamed to thumbnail.urlTransform.queryParams',
    ],
    [
      { thumbnail: { transformUrl: () => '' } },
      'thumbnail.transformUrl was removed, use thumbnail.urlTransform: (args) => url',
    ],
    [
      { signedUrls: { expiresAt: () => 1 } },
      'signedUrls.expiresAt was removed, use signedUrls.expiresIn as a function that returns a Date',
    ],
    [
      { signedUrls: { staticHandler: { useRedirect: true } } },
      'signedUrls.staticHandler.useRedirect was removed, use signedUrls.staticHandler.redirect',
    ],
    [
      { signedUrls: { staticHandler: { redirectStatus: 307 } } },
      'signedUrls.staticHandler.redirectStatus was renamed to signedUrls.staticHandler.redirect.status',
    ],
    [
      { signedUrls: { staticHandler: { expiresIn: 60 } } },
      'signedUrls.staticHandler.expiresIn was renamed to signedUrls.staticHandler.redirect.expiresIn',
    ],
    [
      { storage: { apiKey: 'a', hostname: 'h', s3: { region: 'ny' }, zoneName: 'z' } },
      'storage.s3.region was removed, use storage.region with storage.s3: true',
    ],
    [
      { stream: { ...stream, tus: { checkAccess: () => true } } },
      'stream.tus.checkAccess was renamed to stream.tus.access',
    ],
    [
      { stream: { ...stream, tus: { mimeTypes: ['video/*'] } } },
      'stream.tus.mimeTypes was renamed to stream.mimeTypes',
    ],
    [
      { stream: { ...stream, tus: { uploadTimeout: 60 } } },
      'stream.tus.uploadTimeout was renamed to stream.tus.expiresIn',
    ],
  ])('throws a hint for %o', (options, message) => {
    expect(() => init(options)).toThrow(`[@seshuk/payload-storage-bunny] ${message}`)
    expect(() => init(options, false)).toThrow(`[@seshuk/payload-storage-bunny] ${message}`)
  })

  it('reports removed keys inside a collection with the collection path', () => {
    expect(() =>
      init({
        collections: {
          media: { signedUrls: { staticHandler: { expiresIn: 60 } }, stream: { tus: { checkAccess: () => true } } },
        },
      }),
    ).toThrow(
      '[@seshuk/payload-storage-bunny] collections.media.signedUrls.staticHandler.expiresIn was renamed to signedUrls.staticHandler.redirect.expiresIn\n[@seshuk/payload-storage-bunny] collections.media.stream.tus.checkAccess was renamed to stream.tus.access',
    )
  })

  it('accepts the new shapes', () => {
    expect(() =>
      init({
        accountApiKey: 'key',
        purge: true,
        signedUrls: { staticHandler: { redirect: { status: 307 } } },
        storage: {
          apiKey: 'zone-pw',
          hostname: 'cdn.b-cdn.net',
          region: 'ny',
          s3: true,
          tokenSecurityKey: 't',
          zoneName: 'zone',
        },
        telemetry: false,
      }),
    ).not.toThrow()
  })
})

describe('translations', () => {
  const getTranslations = (i18n?: Config['i18n']) => {
    const result = initPlugin(
      {
        collections: { media: true },
        storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', zoneName: 'zone' },
      },
      [{ slug: 'media', fields: [], upload: true }],
      { i18n },
    )

    return result.i18n?.translations as Record<string, Record<string, Record<string, string>>>
  }

  it('keeps labels the app overrides under the plugin key', () => {
    const translations = getTranslations({
      translations: { en: { '@seshuk/payload-storage-bunny': { tusUploadEnableMode: 'Use TUS' } } },
    } as unknown as Config['i18n'])

    expect(translations.en['@seshuk/payload-storage-bunny'].tusUploadEnableMode).toBe('Use TUS')
    expect(translations.en['@seshuk/payload-storage-bunny'].tusUploadDisableMode).toBe('Disable TUS mode')
  })

  it('keeps the app translations of other namespaces', () => {
    const translations = getTranslations({
      translations: { en: { general: { cancel: 'Abort' } } },
    } as unknown as Config['i18n'])

    expect(translations.en.general.cancel).toBe('Abort')
    expect(translations.en['@seshuk/payload-storage-bunny'].tusUploadEnableMode).toBe('Enable TUS mode')
  })
})

describe('Stream status field', () => {
  const mediaCollection = (stream: Record<string, unknown>): CollectionConfig =>
    initPlugin(
      {
        collections: { media: { disablePayloadAccessControl: true } },
        stream: { apiKey: 'stream-key', hostname: 'stream.b-cdn.net', libraryId: 1, ...stream },
      },
      [{ slug: 'media', fields: [{ name: 'alt', type: 'text' }], upload: true }],
    ).collections!.find((entry) => entry.slug === 'media')!

  it('comes after the storage fields so it is not one of the default list columns', () => {
    expect(mediaCollection({}).fields.flatMap((field) => ('name' in field ? [field.name] : []))).toEqual([
      'bunnyData',
      'alt',
      'thumbnailURL',
      'url',
      'original',
      'prefix',
      '_objectKey',
      'bunnyStream',
    ])
  })

  it('selects the stored video only when the status is on', () => {
    const select = (stream: Record<string, unknown>) =>
      mediaCollection(stream).select!({ select: { bunnyStream: true } } as never) as Record<string, unknown>
    expect(select({ mp4Fallback: true }).bunnyData).toEqual({ stream: { status: true, videoId: true } })
    expect(select({ mp4Fallback: true, status: false }).bunnyData).toBeUndefined()
  })

  it.each([
    { expected: false, stream: { mp4Fallback: false, status: false } },
    { expected: true, stream: { mp4Fallback: false } },
    { expected: true, stream: { mp4Fallback: true, status: false } },
    { expected: true, stream: { mp4Fallback: true } },
  ])('adds the beforeChange hook that keeps the stored values: $expected for $stream', ({ expected, stream }) => {
    expect(mediaCollection(stream).hooks!.beforeChange!.includes(streamBeforeChangeHook)).toBe(expected)
  })

  it('always sends the library ID to the admin and turns the dashboard link on only when it is on', () => {
    const clientStream = (stream: Record<string, unknown>) =>
      mediaCollection({ mp4Fallback: true, ...stream }).admin?.custom?.['@seshuk/payload-storage-bunny']?.stream
    expect(clientStream({})).toMatchObject({ libraryId: 1, link: true })
    expect(clientStream({ status: { link: false } })).toMatchObject({ libraryId: 1 })
    expect(clientStream({ status: { link: false } })).not.toHaveProperty('link')
    expect(clientStream({ status: false })).toMatchObject({ libraryId: 1 })
    expect(clientStream({ status: false })).not.toHaveProperty('link')
  })

  it('gives each collection its own status field', () => {
    const result = initPlugin(
      {
        collections: { clips: { disablePayloadAccessControl: true }, media: { disablePayloadAccessControl: true } },
        stream: { apiKey: 'stream-key', hostname: 'stream.b-cdn.net', libraryId: 1 },
      },
      [
        { slug: 'media', fields: [], upload: true },
        { slug: 'clips', fields: [], upload: true },
      ],
    )

    const [media, clips] = ['media', 'clips'].map((slug) =>
      result
        .collections!.find((entry) => entry.slug === slug)!
        .fields.find((field) => 'name' in field && field.name === 'bunnyStream'),
    )
    expect(media).toMatchObject({ virtual: 'bunnyData.stream.status' })
    expect(clips).toMatchObject({ virtual: 'bunnyData.stream.status' })
    expect(clips).not.toBe(media)
  })
})

describe('background tasks wiring', () => {
  const init = (options: Partial<BunnyStorageOptions>, incoming: Record<string, unknown> = {}): Config =>
    initPlugin(
      { collections: { media: { disablePayloadAccessControl: true } }, ...options },
      [{ slug: 'media', fields: [], upload: true }],
      incoming,
    )

  const stream = { apiKey: 'stream-key', hostname: 'stream.b-cdn.net', libraryId: 1 }
  const storage = { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', zoneName: 'zone' }

  it('registers bunny:task for a stream-only setup with a task', () => {
    const commands = init({ stream: { ...stream, status: { sync: true } } }).cli
    expect(Object.keys((commands as { commands: object }).commands)).toEqual(['bunny:task'])
    expect((commands as { commands: Record<string, string> }).commands['bunny:task']).toMatch(
      /cli\/commands\/task\.js#taskCommand$/,
    )
  })

  it('registers only bunny:deploy-edge-script for storage without tasks', () => {
    const { cli } = init({ storage })
    expect((cli as { commands: object }).commands).toEqual({
      'bunny:deploy-edge-script': expect.stringMatching(/cli\/commands\/deployEdgeScript\.js#deployEdgeScriptCommand$/),
    })
  })

  it('adds no CLI commands for a stream-only setup without tasks, and none when cli is false', () => {
    expect(init({ stream }).cli).toBeUndefined()
    expect(init({ stream: { ...stream, cleanup: true } }, { cli: false }).cli).toBe(false)
  })

  it('registers the Payload tasks and the tasks endpoint', () => {
    const config = init({
      stream: { ...stream, cleanup: true, status: { sync: true } },
      tasks: { secret: 'a-long-enough-secret' },
    })
    expect(config.jobs?.tasks?.map((task) => task.slug)).toEqual([
      'StorageBunnyStreamCleanup',
      'StorageBunnyStreamStatusSync',
    ])
    expect(config.endpoints?.filter((endpoint) => endpoint.path === '/storage-bunny/tasks/:task')).toHaveLength(2)
  })

  it('adds no tasks endpoint without tasks.secret', () => {
    const config = init({ stream: { ...stream, status: { sync: true } } })
    expect(config.endpoints?.some((endpoint) => endpoint.path.startsWith('/storage-bunny/tasks'))).toBe(false)
  })
})

describe('TUS upload component', () => {
  const getUpload = (tus: boolean): unknown =>
    initPlugin(
      {
        collections: { media: { disablePayloadAccessControl: true, storage: false } },
        stream: { apiKey: 'stream-key', hostname: 'vz.b-cdn.net', libraryId: 1, tus },
      },
      [{ slug: 'media', fields: [], upload: { mimeTypes: ['video/*'] } }],
    ).collections?.[0]?.admin?.components?.edit?.Upload

  it('renders the server wrapper with the collection slug so the edit view keeps its filePreview', () => {
    expect(getUpload(true)).toEqual({
      path: '@seshuk/payload-storage-bunny/rsc#TusUploadServer',
      serverProps: { collectionSlug: 'media' },
    })
  })

  it('keeps the default upload when TUS is off', () => {
    expect(getUpload(false)).toBeUndefined()
  })
})

describe('Stream file preview', () => {
  const getFilePreview = (media: MediaOptions, preview?: boolean): unknown => {
    const result = initPlugin(
      {
        collections: { media },
        storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', zoneName: 'zone' },
        stream: { apiKey: 'stream-key', hostname: 'vz.b-cdn.net', libraryId: 1, preview },
      },
      [{ slug: 'media', fields: [], upload: { mimeTypes: ['video/*', 'image/*'] } }],
    )

    const upload = result.collections?.[0]?.upload as { admin?: { components?: { filePreview?: unknown } } }
    return upload.admin?.components?.filePreview
  }

  it('registers the Stream player for video and audio of Stream collections', () => {
    const player = {
      clientProps: { status: true },
      path: '@seshuk/payload-storage-bunny/client#StreamFilePreview',
    }

    expect(getFilePreview({ disablePayloadAccessControl: true, storage: false })).toEqual({
      'audio/*': player,
      'video/*': player,
    })
  })

  it('registers nothing with preview false, globally or per collection', () => {
    expect(getFilePreview({ disablePayloadAccessControl: true, storage: false }, false)).toBeUndefined()
    expect(
      getFilePreview({ disablePayloadAccessControl: true, storage: false, stream: { preview: false } }),
    ).toBeUndefined()
  })

  it('registers nothing for collections without Stream', () => {
    expect(getFilePreview({ disablePayloadAccessControl: true, stream: false })).toBeUndefined()
  })

  it('warns on init when the final filePreview turns off the Stream player', async () => {
    const config = initPlugin(
      {
        collections: { media: { disablePayloadAccessControl: true, storage: false } },
        stream: { apiKey: 'stream-key', hostname: 'vz.b-cdn.net', libraryId: 1 },
        telemetry: false,
      },
      [{ slug: 'media', fields: [], upload: { admin: { components: { filePreview: { 'video/*': false } } } } }],
    )
    const payload = {
      collections: { media: { config: config.collections?.[0] } },
      config,
      logger: { warn: vi.fn() },
    }

    await config.onInit?.(payload as never)

    expect(payload.logger.warn).toHaveBeenCalledWith({
      msg: expect.stringContaining('[bunny:stream] preview: collection "media" sets filePreview "video/*" to false'),
    })
  })
})
