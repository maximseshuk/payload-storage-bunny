import type { Config } from 'payload'
import { describe, expect, it } from 'vitest'

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

  it('does not wire the adapter, hooks or plugin config', () => {
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
