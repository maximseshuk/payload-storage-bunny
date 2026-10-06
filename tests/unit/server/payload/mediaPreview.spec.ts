import { mediaPreview } from '@seshuk/payload-plugin-media-preview'
import type {
  MediaPreviewAdapterResolveArgs,
  MediaPreviewAdapterResolveResult,
} from '@seshuk/payload-plugin-media-preview'
import type { Config } from 'payload'
import { describe, expect, it } from 'vitest'

import { bunnyStreamAdapter } from '@/server/payload/mediaPreview.js'
import { createNormalizedOptions } from '@/server/payload/options/normalizer.js'
import { PLUGIN_KEY } from '@/shared/constants.js'

const streamDoc = {
  id: 7,
  filename: 'clip.mp4',
  bunnyData: {
    stream: { libraryId: 123456, status: 'processing', videoId: 'e7f2c1a0-1111-2222-3333-444455556666' },
    type: 'stream',
  },
}

const options = createNormalizedOptions({
  collections: { media: true, plain: { stream: { status: false } } },
  stream: { apiKey: 'stream-key', hostname: 'stream.b-cdn.net', libraryId: 123456 },
} as never)

const payload = { config: { custom: { [PLUGIN_KEY]: { config: options } } } }

const resolve = (args: Pick<MediaPreviewAdapterResolveArgs, 'doc' | 'mimeType'>, collectionSlug = 'media') =>
  bunnyStreamAdapter.resolve({
    collectionSlug,
    payload: payload as unknown as MediaPreviewAdapterResolveArgs['payload'],
    ...args,
  }) as MediaPreviewAdapterResolveResult | null

describe('bunnyStreamAdapter', () => {
  it('exposes the bunny-stream descriptor', () => {
    expect(bunnyStreamAdapter.name).toBe('bunny-stream')
    expect(bunnyStreamAdapter.Component).toBe('@seshuk/payload-storage-bunny/client#StreamPreview')
    expect(bunnyStreamAdapter.mimeTypes).toEqual(['video/*', 'audio/*'])
  })

  it('replaces only the built-in video and audio previews in the edit view', async () => {
    const config = (await mediaPreview({
      adapters: [bunnyStreamAdapter],
      collections: { media: true },
      telemetry: false,
    })({
      collections: [{ slug: 'media', fields: [], upload: true }],
    } as unknown as Config)) as Config
    const upload = config.collections?.[0]?.upload as {
      admin: { components: { filePreview: Record<string, unknown> } }
    }
    const { filePreview } = upload.admin.components

    expect(filePreview['video/*']).toMatchObject({ path: '@seshuk/payload-plugin-media-preview/rsc#MediaPreviewFile' })
    expect(filePreview['audio/*']).toMatchObject({ path: '@seshuk/payload-plugin-media-preview/rsc#MediaPreviewFile' })
    expect(filePreview['image/*']).toBe(false)
    expect(filePreview['application/pdf']).toBe(false)
  })

  it('returns an inline stream preview descriptor for a video doc with stream data', () => {
    const result = resolve({ doc: streamDoc, mimeType: 'video/mp4' })

    expect(result).toEqual({
      mode: 'inline',
      props: {
        id: 7,
        allow: 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;',
        allowFullScreen: true,
        collectionSlug: 'media',
        src: 'https://iframe.mediadelivery.net/embed/123456/e7f2c1a0-1111-2222-3333-444455556666?autoplay=false&preload=true&muted=false',
        status: 'processing',
        title: 'clip.mp4',
        videoId: 'e7f2c1a0-1111-2222-3333-444455556666',
      },
    })
  })

  it('returns the plain player props with the file name as title when the collection has the status turned off', () => {
    const result = resolve({ doc: streamDoc, mimeType: 'video/mp4' }, 'plain')

    expect(result).toEqual({
      mode: 'inline',
      props: {
        allow: 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;',
        allowFullScreen: true,
        src: 'https://iframe.mediadelivery.net/embed/123456/e7f2c1a0-1111-2222-3333-444455556666?autoplay=false&preload=true&muted=false',
        title: 'clip.mp4',
      },
    })
  })

  it('resolves audio docs the same way', () => {
    const result = resolve({ doc: streamDoc, mimeType: 'audio/mpeg' })

    expect(result?.mode).toBe('inline')
  })

  it('returns null for non-video/audio mime types', () => {
    expect(resolve({ doc: streamDoc, mimeType: 'image/png' })).toBeNull()
    expect(resolve({ doc: streamDoc })).toBeNull()
  })

  it('returns null when the doc carries no bunny stream data', () => {
    expect(resolve({ doc: {}, mimeType: 'video/mp4' })).toBeNull()
    expect(resolve({ doc: { bunnyData: { type: 'stream' } }, mimeType: 'video/mp4' })).toBeNull()
  })

  it('returns null when videoId or libraryId is missing', () => {
    const noVideoId = { bunnyData: { stream: { libraryId: 123456 }, type: 'stream' } }
    const noLibraryId = { bunnyData: { stream: { videoId: 'abc' }, type: 'stream' } }

    expect(resolve({ doc: noVideoId, mimeType: 'video/mp4' })).toBeNull()
    expect(resolve({ doc: noLibraryId, mimeType: 'video/mp4' })).toBeNull()
  })
})
