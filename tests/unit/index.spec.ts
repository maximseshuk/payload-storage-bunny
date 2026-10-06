import type { Config } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { bunnyStorage } from '@/index.js'
import type { BunnyStorageOptions } from '@/shared/types/index.js'

type MediaOptions = BunnyStorageOptions['collections'][string]

type UploadInstructions = {
  generate: (args: Record<string, unknown>) => Promise<unknown>
  useInAdmin: boolean
}

const buildMediaUpload = (media: MediaOptions, options: Partial<BunnyStorageOptions> = {}): Record<string, unknown> => {
  const incoming = {
    collections: [{ slug: 'media', fields: [], upload: { disableLocalStorage: true } }],
  } as unknown as Config

  const result = bunnyStorage({
    collections: { media },
    storage: {
      apiKey: 'zone-pw',
      hostname: 'cdn.b-cdn.net',
      tokenSecurityKey: 'security-key',
      zoneName: 'zone',
    },
    ...options,
  } as BunnyStorageOptions).init(incoming) as Config

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

describe('client upload handler registration', () => {
  const stream = { apiKey: 'stream-key', hostname: 'vz.b-cdn.net', libraryId: 1, mp4Fallback: true, tus: true }

  const getHandlerProviders = (media: MediaOptions): Array<{ clientProps: Record<string, unknown> }> => {
    const incoming = {
      collections: [{ slug: 'media', fields: [], upload: { mimeTypes: ['video/*', 'image/*'] } }],
    } as unknown as Config

    const result = bunnyStorage({
      collections: { media },
      storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', s3: true, zoneName: 'zone' },
      stream,
    } as BunnyStorageOptions).init(incoming) as Config

    return (result.admin?.components?.providers ?? []).filter(
      (provider) =>
        typeof provider === 'object' &&
        provider.path === '@seshuk/payload-storage-bunny/client#BunnyClientUploadHandler',
    ) as Array<{ clientProps: Record<string, unknown> }>
  }

  it('routes stream-only TUS collections through the handler with their video types', () => {
    const [provider] = getHandlerProviders({ disablePayloadAccessControl: true, storage: false })

    expect(provider?.clientProps.collectionSlug).toBe('media')
  })

  it('routes videos over TUS when the collection also has Storage client uploads', () => {
    const [provider] = getHandlerProviders({ storage: { clientUploads: true } })

    expect(provider?.clientProps.collectionSlug).toBe('media')
  })

  it('leaves storage and stream collections without client uploads on server uploads', () => {
    expect(getHandlerProviders(true)).toEqual([])
  })

  it('dispatches only Stream videos to the handler of a stream-only TUS collection', async () => {
    const incoming = {
      collections: [{ slug: 'media', fields: [], upload: { mimeTypes: ['video/*', 'image/*'] } }],
    } as unknown as Config
    const result = bunnyStorage({
      collections: { media: { disablePayloadAccessControl: true, storage: false } },
      storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', s3: true, zoneName: 'zone' },
      stream,
    } as BunnyStorageOptions).init(incoming) as Config
    const media = result.collections?.find((entry) => entry.slug === 'media')
    const { generate, useInAdmin } = (media!.upload as { uploadInstructions: UploadInstructions }).uploadInstructions
    const req = {
      payload: { collections: { media: { config: media } }, config: { upload: {} } },
      t: (key: string) => key,
    }
    const upload = (filename: string, mimeType: string) =>
      generate({ collectionSlug: 'media', filename, filesize: 1000, mimeType, overrideAccess: true, req })

    expect(useInAdmin).toBe(true)
    expect(await upload('clip.mp4', 'video/mp4')).toMatchObject({ name: 'bunny', type: 'dispatch' })
    await expect(upload('photo.jpg', 'image/jpeg')).rejects.toMatchObject({ status: 403 })
  })
})

describe('schema when the plugin is disabled', () => {
  const fieldNames = (enabled: boolean): string[] => {
    const incoming = {
      collections: [
        { slug: 'media', fields: [], upload: { imageSizes: [{ name: 'thumb', width: 100 }] } },
        { slug: 'posts', fields: [] },
      ],
    } as unknown as Config

    const result = bunnyStorage({
      collections: { media: { prefix: 'media' } },
      enabled,
      storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', zoneName: 'zone' },
    } as BunnyStorageOptions).init(incoming) as Config

    expect(result.collections?.find((entry) => entry.slug === 'posts')?.fields).toEqual([])

    return (result.collections?.find((entry) => entry.slug === 'media')?.fields ?? []).flatMap((field) =>
      'name' in field ? [field.name] : [],
    )
  }

  it('inserts the prefix and object key fields', () => {
    const fields = fieldNames(false)

    expect(fields).toEqual(expect.arrayContaining(['prefix', '_objectKey', 'url', 'sizes']))
  })

  it('keeps the same storage columns as the enabled plugin', () => {
    const storageFields = ['prefix', '_objectKey', 'url', 'sizes']

    expect(fieldNames(false).filter((name) => storageFields.includes(name))).toEqual(
      fieldNames(true).filter((name) => storageFields.includes(name)),
    )
  })

  it('defaults the prefix to the collection prefix', () => {
    const incoming = { collections: [{ slug: 'media', fields: [], upload: true }] } as unknown as Config
    const result = bunnyStorage({
      collections: { media: { prefix: 'media' } },
      enabled: false,
      storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', zoneName: 'zone' },
    } as BunnyStorageOptions).init(incoming) as Config
    const prefix = result.collections?.[0]?.fields.find((field) => 'name' in field && field.name === 'prefix')

    expect(prefix).toMatchObject({ type: 'text', defaultValue: 'media' })
  })

  it('does not wire the adapter, hooks or plugin options', () => {
    const incoming = { collections: [{ slug: 'media', fields: [], upload: true }] } as unknown as Config
    const result = bunnyStorage({
      collections: { media: true },
      enabled: false,
      storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', zoneName: 'zone' },
    } as BunnyStorageOptions).init(incoming) as Config

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
    bunnyStorage({
      collections: { media: true },
      enabled,
      storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', zoneName: 'zone' },
      ...options,
    } as BunnyStorageOptions).init({ collections: [{ slug: 'media', fields: [], upload: true }] } as unknown as Config)

  it.each([
    [{ telemetry: { endpoint: 'https://x' } }, 'telemetry.endpoint was renamed to telemetry.url'],
    [
      { urlTransform: { transformUrl: () => '' } },
      'urlTransform.transformUrl was removed, use urlTransform: (args) => url',
    ],
    [
      { thumbnail: { appendTimestamp: true } },
      'thumbnail.appendTimestamp was renamed to thumbnail.urlTransform.appendTimestamp',
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
      { storage: { apiKey: 'a', hostname: 'h', s3: { region: 'ny' }, zoneName: 'z' } },
      'storage.s3.region was removed, use storage.region with storage.s3: true',
    ],
    [
      { stream: { apiKey: 'a', hostname: 'h', libraryId: 1, tus: { checkAccess: () => true } } },
      'stream.tus.checkAccess was renamed to stream.tus.access',
    ],
    [
      { i18n: { translations: {} } },
      "i18n was removed, use Payload's i18n.translations['@seshuk/payload-storage-bunny']",
    ],
    [{ apiKey: 'key' }, 'apiKey was renamed to accountApiKey'],
    [{ purge: { apiKey: 'key' } }, 'purge.apiKey was removed, use the top-level accountApiKey'],
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
    const incoming = {
      collections: [{ slug: 'media', fields: [], upload: true }],
      i18n,
    } as unknown as Config

    const result = bunnyStorage({
      collections: { media: true },
      storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', zoneName: 'zone' },
    } as BunnyStorageOptions).init(incoming) as Config

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
  const fieldNames = (stream: Record<string, unknown>): string[] => {
    const incoming = {
      collections: [{ slug: 'media', fields: [{ name: 'alt', type: 'text' }], upload: true }],
    } as unknown as Config

    const result = bunnyStorage({
      collections: { media: { disablePayloadAccessControl: true } },
      stream: { apiKey: 'stream-key', hostname: 'stream.b-cdn.net', libraryId: 1, ...stream },
    } as BunnyStorageOptions).init(incoming) as Config

    return (result.collections?.find((entry) => entry.slug === 'media')?.fields ?? []).flatMap((field) =>
      'name' in field ? [field.name] : [],
    )
  }

  it('comes after the storage fields so it is not one of the default list columns', () => {
    expect(fieldNames({})).toEqual(['bunnyData', 'alt', 'thumbnailURL', 'url', 'prefix', '_objectKey', 'bunnyStream'])
  })

  it('is not added when the status is turned off', () => {
    expect(fieldNames({ status: false })).not.toContain('bunnyStream')
  })

  const mediaCollection = (stream: Record<string, unknown>) => {
    const incoming = {
      collections: [{ slug: 'media', fields: [{ name: 'alt', type: 'text' }], upload: true }],
    } as unknown as Config

    const result = bunnyStorage({
      collections: { media: { disablePayloadAccessControl: true } },
      stream: { apiKey: 'stream-key', hostname: 'stream.b-cdn.net', libraryId: 1, ...stream },
    } as BunnyStorageOptions).init(incoming) as Config

    return result.collections!.find((entry) => entry.slug === 'media')!
  }

  it('adds the status select only when the status is on', () => {
    expect(mediaCollection({ mp4Fallback: true }).select).toBeTypeOf('function')
    expect(mediaCollection({ mp4Fallback: true, status: false }).select).toBeUndefined()
  })

  it('adds the beforeChange hook that keeps the stored values when the status or mp4Fallback is on', () => {
    const hookCount = (stream: Record<string, unknown>) => mediaCollection(stream).hooks!.beforeChange!.length
    const neither = hookCount({ mp4Fallback: false, status: false })
    expect(hookCount({ mp4Fallback: false })).toBe(neither + 1)
    expect(hookCount({ mp4Fallback: true, status: false })).toBe(neither + 1)
    expect(hookCount({ mp4Fallback: true })).toBe(neither + 1)
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
    const incoming = {
      collections: [
        { slug: 'media', fields: [], upload: true },
        { slug: 'clips', fields: [], upload: true },
      ],
    } as unknown as Config

    const result = bunnyStorage({
      collections: { clips: { disablePayloadAccessControl: true }, media: { disablePayloadAccessControl: true } },
      stream: { apiKey: 'stream-key', hostname: 'stream.b-cdn.net', libraryId: 1 },
    } as BunnyStorageOptions).init(incoming) as Config

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
  const init = (options: Partial<BunnyStorageOptions>, incoming: Partial<Config> = {}): Config =>
    bunnyStorage({
      collections: { media: { disablePayloadAccessControl: true } },
      ...options,
    } as BunnyStorageOptions).init({
      collections: [{ slug: 'media', fields: [], upload: true }],
      ...incoming,
    } as unknown as Config) as Config

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
    expect(Object.keys((cli as { commands: object }).commands)).toEqual(['bunny:deploy-edge-script'])
  })

  it('adds no CLI commands for a stream-only setup without tasks, and none when cli is false', () => {
    expect(init({ stream }).cli).toBeUndefined()
    expect(init({ stream: { ...stream, cleanup: true } }, { cli: false } as never).cli).toBe(false)
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
  const getUpload = (tus: boolean): unknown => {
    const incoming = {
      collections: [{ slug: 'media', fields: [], upload: { mimeTypes: ['video/*'] } }],
    } as unknown as Config

    const result = bunnyStorage({
      collections: { media: { disablePayloadAccessControl: true, storage: false } },
      stream: { apiKey: 'stream-key', hostname: 'vz.b-cdn.net', libraryId: 1, tus },
    } as BunnyStorageOptions).init(incoming) as Config

    return result.collections?.[0]?.admin?.components?.edit?.Upload
  }

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
    const incoming = {
      collections: [{ slug: 'media', fields: [], upload: { mimeTypes: ['video/*', 'image/*'] } }],
    } as unknown as Config

    const result = bunnyStorage({
      collections: { media },
      storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', zoneName: 'zone' },
      stream: { apiKey: 'stream-key', hostname: 'vz.b-cdn.net', libraryId: 1, preview },
    } as BunnyStorageOptions).init(incoming) as Config

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
    const config = bunnyStorage({
      collections: { media: { disablePayloadAccessControl: true, storage: false } },
      stream: { apiKey: 'stream-key', hostname: 'vz.b-cdn.net', libraryId: 1 },
      telemetry: false,
    } as BunnyStorageOptions).init({
      collections: [
        { slug: 'media', fields: [], upload: { admin: { components: { filePreview: { 'video/*': false } } } } },
      ],
    } as unknown as Config) as Config
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
