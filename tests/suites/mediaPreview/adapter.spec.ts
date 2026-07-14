import { describe, expect, it } from 'vitest'

import { bunnyStreamAdapter } from '@/mediaPreview/adapter.js'

const streamDoc = {
  bunnyData: {
    stream: { libraryId: 123456, videoId: 'e7f2c1a0-1111-2222-3333-444455556666' },
    type: 'stream',
  },
}

describe('bunnyStreamAdapter', () => {
  it('exposes the bunny-stream descriptor', () => {
    expect(bunnyStreamAdapter.name).toBe('bunny-stream')
    expect(bunnyStreamAdapter.Component).toBe('@seshuk/payload-plugin-media-preview/client#IframeViewer')
  })

  it('returns an inline iframe descriptor for a video doc with stream data', () => {
    const result = bunnyStreamAdapter.resolve({ doc: streamDoc, mimeType: 'video/mp4' })

    expect(result).toEqual({
      mode: 'inline',
      props: {
        allow: 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;',
        allowFullScreen: true,
        src: 'https://iframe.mediadelivery.net/embed/123456/e7f2c1a0-1111-2222-3333-444455556666?autoplay=false&preload=true&muted=false',
      },
    })
  })

  it('resolves audio docs the same way', () => {
    const result = bunnyStreamAdapter.resolve({ doc: streamDoc, mimeType: 'audio/mpeg' })

    expect(result?.mode).toBe('inline')
  })

  it('returns null for non-video/audio mime types', () => {
    expect(bunnyStreamAdapter.resolve({ doc: streamDoc, mimeType: 'image/png' })).toBeNull()
    expect(bunnyStreamAdapter.resolve({ doc: streamDoc })).toBeNull()
  })

  it('returns null when the doc carries no bunny stream data', () => {
    expect(bunnyStreamAdapter.resolve({ doc: {}, mimeType: 'video/mp4' })).toBeNull()
    expect(bunnyStreamAdapter.resolve({ doc: { bunnyData: { type: 'stream' } }, mimeType: 'video/mp4' })).toBeNull()
  })

  it('returns null when videoId or libraryId is missing', () => {
    const noVideoId = { bunnyData: { stream: { libraryId: 123456 }, type: 'stream' } }
    const noLibraryId = { bunnyData: { stream: { videoId: 'abc' }, type: 'stream' } }

    expect(bunnyStreamAdapter.resolve({ doc: noVideoId, mimeType: 'video/mp4' })).toBeNull()
    expect(bunnyStreamAdapter.resolve({ doc: noLibraryId, mimeType: 'video/mp4' })).toBeNull()
  })
})
