import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { StreamFilePreview } from '@/client/StreamFilePreview/StreamFilePreview.js'

const form = vi.hoisted(() => ({
  id: 7 as number | undefined,
  cacheTags: true,
  data: {} as Record<string, unknown>,
  fields: {} as Record<string, { value: unknown }>,
}))
const streamPreview = vi.hoisted(() => vi.fn((_props: Record<string, unknown>) => null))

vi.mock('@payloadcms/ui', async () => {
  const { createElement: h } = await import('react')
  const { PLUGIN_KEY } = await import('@/shared/constants.js')
  return {
    Thumbnail: ({
      className,
      fileSrc,
      imageCacheTag,
      size,
    }: {
      className: string
      fileSrc?: string
      imageCacheTag?: false | string
      size: string
    }) => h('div', { className, 'data-size': size, 'data-src': fileSrc, 'data-tag': imageCacheTag || undefined }),
    useConfig: () => ({
      getEntityConfig: ({ collectionSlug }: { collectionSlug: string }) =>
        collectionSlug === 'media'
          ? {
              admin: { custom: { [PLUGIN_KEY]: { stream: { mimeTypes: ['application/x-mpegURL'] } } } },
              upload: { cacheTags: form.cacheTags },
            }
          : undefined,
    }),
    useDocumentInfo: () => ({ id: form.id, collectionSlug: 'media', data: form.data }),
    useFormFields: (selector: (state: [typeof form.fields]) => unknown) => selector([form.fields]),
  }
})

vi.mock('@payloadcms/ui/elements/FileManager/FilePreview/VideoPreview', async () => {
  const { createElement: h } = await import('react')
  return { VideoPreview: ({ fileSrc }: { fileSrc: string }) => h('video', { src: fileSrc }) }
})

vi.mock('@payloadcms/ui/elements/FileManager/FilePreview/AudioPreview', async () => {
  const { createElement: h } = await import('react')
  return { AudioPreview: ({ fileSrc }: { fileSrc: string }) => h('audio', { src: fileSrc }) }
})

vi.mock('@/client/StreamPreview/StreamPreview.js', () => ({ StreamPreview: streamPreview }))

const render = (
  fields: Record<string, unknown>,
  status = true,
  {
    id = 7 as null | number,
    cacheTags = false,
    doc = {} as Record<string, unknown>,
    fileSrc = '/api/media/file/clip.mp4',
    mimeType = 'video/mp4',
    savedStatus = undefined as string | undefined,
    savedVideoId = fields['bunnyData.stream.videoId'],
  } = {},
) => {
  form.id = id ?? undefined
  form.cacheTags = cacheTags
  form.data = {
    bunnyData: { stream: { status: savedStatus, videoId: savedVideoId } },
    mimeType,
    url: fileSrc || undefined,
    ...doc,
  }
  form.fields = Object.fromEntries(Object.entries(fields).map(([path, value]) => [path, { value }]))
  return renderToStaticMarkup(
    createElement(StreamFilePreview, {
      filename: 'clip.mp4',
      filesize: 1,
      fileSrc,
      mimeType,
      status,
    }),
  )
}

const lastProps = () => streamPreview.mock.lastCall?.[0]

describe('StreamFilePreview', () => {
  it('falls back to the Payload video preview without a Stream video', () => {
    expect(render({})).toBe('<video src="/api/media/file/clip.mp4"></video>')
    expect(render({ 'bunnyData.stream.libraryId': 42 })).toBe('<video src="/api/media/file/clip.mp4"></video>')
  })

  it('falls back to the Payload audio preview for an audio file without a Stream video', () => {
    expect(render({}, true, { fileSrc: '/api/media/file/clip.mp3', mimeType: 'audio/mpeg' })).toBe(
      '<audio src="/api/media/file/clip.mp3"></audio>',
    )
  })

  it('falls back to the Payload thumbnail without a Stream video and a file URL', () => {
    expect(render({}, true, { fileSrc: '' })).toBe('<div class="file-preview__thumbnail" data-size="expand"></div>')
  })

  it('builds the fallback from the saved document, because Payload keeps the old props after a save', () => {
    expect(
      render({}, true, {
        doc: {
          mimeType: 'image/png',
          thumbnailURL: '/api/media/file/photo-300x300.png',
          url: '/api/media/file/photo.png',
        },
      }),
    ).toBe(
      '<div class="file-preview__thumbnail" data-size="expand" data-src="/api/media/file/photo-300x300.png"></div>',
    )
    expect(render({}, true, { doc: { mimeType: 'application/pdf', url: '/api/media/file/doc.pdf' } })).toBe(
      '<div class="file-preview__thumbnail" data-size="expand" data-src="/api/media/file/doc.pdf"></div>',
    )
  })

  it('adds the cache tag of the saved document to the fallback when the collection uses cache tags', () => {
    const updatedAt = '2026-10-08T00:00:00.000Z'

    expect(render({}, true, { cacheTags: true, doc: { updatedAt } })).toBe(
      `<video src="/api/media/file/clip.mp4?${encodeURIComponent(updatedAt)}"></video>`,
    )
    expect(render({}, true, { cacheTags: true, doc: { mimeType: 'image/png', updatedAt } })).toBe(
      `<div class="file-preview__thumbnail" data-size="expand" data-src="/api/media/file/clip.mp4" data-tag="${updatedAt}"></div>`,
    )
    expect(render({}, true, { doc: { updatedAt } })).toBe('<video src="/api/media/file/clip.mp4"></video>')
  })

  it('shows the Stream player for an audio file with a Stream video', () => {
    render({ 'bunnyData.stream.libraryId': 42, 'bunnyData.stream.videoId': 'vid-1' }, true, {
      fileSrc: '/api/media/file/clip.mp3',
      mimeType: 'audio/mpeg',
      savedStatus: 'ready',
    })

    expect(lastProps()).toMatchObject({
      src: 'https://iframe.mediadelivery.net/embed/42/vid-1?autoplay=false&preload=true&muted=false',
      status: 'ready',
      videoId: 'vid-1',
    })
  })

  it('shows the Stream preview with the stored status and shares the status of the video', () => {
    render({ 'bunnyData.stream.libraryId': 42, 'bunnyData.stream.videoId': 'vid-1' }, true, {
      savedStatus: 'processing',
    })

    expect(lastProps()).toEqual({
      id: 7,
      allow: 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;',
      allowFullScreen: true,
      collectionSlug: 'media',
      src: 'https://iframe.mediadelivery.net/embed/42/vid-1?autoplay=false&preload=true&muted=false',
      status: 'processing',
      title: 'clip.mp4',
      videoId: 'vid-1',
    })
  })

  it.each([
    ['replaced', { savedVideoId: 'vid-old' }],
    ['new', { id: null }],
  ])('shows a %s video as processing without asking for its status before the document is saved', (_, doc) => {
    render({ 'bunnyData.stream.libraryId': 42, 'bunnyData.stream.videoId': 'vid-1' }, true, {
      ...doc,
      savedStatus: 'ready',
    })

    expect(lastProps()).toMatchObject({
      id: undefined,
      collectionSlug: 'media',
      status: 'processing',
      videoId: 'vid-1',
    })
  })

  it('falls back to the saved file when the form keeps the old video ID of a replaced Stream video', () => {
    streamPreview.mockClear()

    expect(
      render({ 'bunnyData.stream.libraryId': 42, 'bunnyData.stream.videoId': 'vid-1', mimeType: 'image/jpeg' }, true, {
        doc: { bunnyData: undefined, mimeType: 'image/jpeg', url: '/api/media/file/photo.jpg' },
      }),
    ).toBe('<div class="file-preview__thumbnail" data-size="expand" data-src="/api/media/file/photo.jpg"></div>')
    expect(streamPreview).not.toHaveBeenCalled()
  })

  it('shows the Stream player for a file that matches the Stream MIME types', () => {
    render(
      { 'bunnyData.stream.libraryId': 42, 'bunnyData.stream.videoId': 'vid-1', mimeType: 'application/x-mpegURL' },
      true,
      { savedStatus: 'ready' },
    )

    expect(lastProps()).toMatchObject({ status: 'ready', videoId: 'vid-1' })
  })

  it('shows the plain player when the status is off', () => {
    render({ 'bunnyData.stream.libraryId': 42, 'bunnyData.stream.videoId': 'vid-1' }, false)

    expect(lastProps()).toMatchObject({ id: undefined, collectionSlug: undefined })
  })
})
