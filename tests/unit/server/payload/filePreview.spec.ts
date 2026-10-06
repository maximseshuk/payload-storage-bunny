import { describe, expect, it, vi } from 'vitest'

import { getStreamFilePreviewAdmin, warnIfStreamPreviewTurnedOff } from '@/server/payload/filePreview.js'
import { PLUGIN_KEY } from '@/shared/constants.js'
import type { NormalizedStreamOptions } from '@/shared/types/index.js'

const OURS = {
  clientProps: { status: true },
  path: '@seshuk/payload-storage-bunny/client#StreamFilePreview',
}

const MIME_TYPES = ['video/mp4', 'video/webm', 'audio/mpeg']

const streamOptions = { mimeTypes: MIME_TYPES, status: {} } as NormalizedStreamOptions

const getFilePreview = (filePreview: unknown, options = streamOptions) =>
  getStreamFilePreviewAdmin({ admin: { components: { filePreview } } } as never, options)?.components?.filePreview

describe('getStreamFilePreviewAdmin', () => {
  it('sets a video and audio map when the collection has no filePreview', () => {
    expect(getStreamFilePreviewAdmin(true, streamOptions)).toEqual({
      components: { filePreview: { 'audio/*': OURS, 'video/*': OURS } },
    })
  })

  it('keeps the other upload admin options', () => {
    const admin = getStreamFilePreviewAdmin(
      { admin: { components: { controls: ['x'] }, hideFileInputOnCreate: true } } as never,
      streamOptions,
    )

    expect(admin).toEqual({
      components: { controls: ['x'], filePreview: { 'audio/*': OURS, 'video/*': OURS } },
      hideFileInputOnCreate: true,
    })
  })

  it('leaves a single filePreview component alone', () => {
    expect(getFilePreview('my-pkg#Preview')).toBe('my-pkg#Preview')
    expect(getFilePreview({ path: 'my-pkg#Preview' })).toEqual({ path: 'my-pkg#Preview' })
    expect(getFilePreview(false)).toBe(false)
  })

  it('keeps the video/* and audio/* entries a map already has', () => {
    const map = { 'audio/*': 'my-pkg#Audio', 'video/*': false }

    expect(getFilePreview(map)).toEqual(map)
  })

  it('adds audio/* to a map that has only video/*', () => {
    expect(getFilePreview({ 'video/*': false })).toEqual({ 'audio/*': OURS, 'video/*': false })
  })

  it('adds video/* to a map that has only audio/*', () => {
    expect(getFilePreview({ 'audio/*': 'my-pkg#Audio' })).toEqual({ 'audio/*': 'my-pkg#Audio', 'video/*': OURS })
  })

  it('leaves a map with *, because the user owns every type then', () => {
    const map = { '*': 'my-pkg#Any' }

    expect(getFilePreview(map)).toBe(map)
  })

  it('adds the categories next to exact types, which keep winning for their own type', () => {
    expect(getFilePreview({ 'audio/mpeg': 'my-pkg#Mp3', 'video/mp4': 'my-pkg#Mp4' })).toEqual({
      'audio/*': OURS,
      'audio/mpeg': 'my-pkg#Mp3',
      'video/*': OURS,
      'video/mp4': 'my-pkg#Mp4',
    })
  })

  it('tells the component when the status is off', () => {
    const filePreview = getFilePreview(undefined, {
      mimeTypes: MIME_TYPES,
      status: false,
    } as NormalizedStreamOptions) as Record<string, { clientProps: unknown }>

    expect(filePreview['video/*']?.clientProps).toEqual({ status: false })
    expect(filePreview['audio/*']?.clientProps).toEqual({ status: false })
  })

  it('adds only the categories that appear in the Stream mimeTypes', () => {
    expect(getFilePreview(undefined, { mimeTypes: ['video/mp4'], status: {} } as NormalizedStreamOptions)).toEqual({
      'video/*': OURS,
    })
    expect(
      getFilePreview({ 'audio/*': false }, { mimeTypes: ['audio/mpeg'], status: {} } as NormalizedStreamOptions),
    ).toEqual({
      'audio/*': false,
    })
  })

  it('leaves the filePreview alone when the Stream mimeTypes have no video or audio type', () => {
    const options = { mimeTypes: ['application/mxf'], status: {} } as NormalizedStreamOptions

    expect(getFilePreview(undefined, options)).toBeUndefined()
  })
})

describe('warnIfStreamPreviewTurnedOff', () => {
  const payloadWith = (
    filePreview: unknown,
    collection: unknown = { stream: { mimeTypes: MIME_TYPES, preview: true } },
  ) => ({
    collections: { media: { config: { upload: { admin: { components: { filePreview } } } } } },
    config: { custom: { [PLUGIN_KEY]: { config: { collections: new Map([['media', collection]]) } } } },
    logger: { warn: vi.fn() },
  })

  it('warns when the media preview map turns off video/* and audio/*', () => {
    const payload = payloadWith({ '*': 'media-preview#File', 'audio/*': false, 'video/*': false })

    warnIfStreamPreviewTurnedOff(payload as never)

    expect(payload.logger.warn).toHaveBeenCalledExactlyOnceWith({
      msg: expect.stringContaining('collection "media" sets filePreview "video/*" and "audio/*" to false'),
    })
  })

  it('stays quiet when video/* and audio/* have a component', () => {
    const payload = payloadWith({
      '*': 'media-preview#File',
      'audio/*': 'media-preview#File',
      'video/*': 'media-preview#File',
    })

    warnIfStreamPreviewTurnedOff(payload as never)

    expect(payload.logger.warn).not.toHaveBeenCalled()
  })

  it('stays quiet when stream.preview is off or the collection has no Stream', () => {
    for (const collection of [{ stream: { mimeTypes: MIME_TYPES, preview: false } }, {}]) {
      const payload = payloadWith({ 'video/*': false }, collection)

      warnIfStreamPreviewTurnedOff(payload as never)

      expect(payload.logger.warn).not.toHaveBeenCalled()
    }
  })

  it.each([
    { filePreview: { 'video/*': false }, keys: '"video/*"' },
    { filePreview: { 'audio/*': false }, keys: '"audio/*"' },
    { filePreview: { 'video/mp4': false }, keys: '"video/mp4"' },
    { filePreview: { 'audio/*': false, 'video/mp4': false }, keys: '"audio/*" and "video/mp4"' },
  ])('names only the keys set to false ($keys)', ({ filePreview, keys }) => {
    const payload = payloadWith(filePreview)

    warnIfStreamPreviewTurnedOff(payload as never)

    expect(payload.logger.warn).toHaveBeenCalledExactlyOnceWith({
      msg: expect.stringContaining(`collection "media" sets filePreview ${keys} to false,`),
    })
  })

  it('ignores keys outside the Stream mimeTypes', () => {
    const payload = payloadWith(
      { 'audio/*': false, 'video/mp4': false, 'video/quicktime': false },
      { stream: { mimeTypes: ['video/webm'], preview: true } },
    )

    warnIfStreamPreviewTurnedOff(payload as never)

    expect(payload.logger.warn).not.toHaveBeenCalled()
  })

  it.each([{ path: 'my-pkg#Preview' }, 'my-pkg#Preview'])(
    'stays quiet for a single filePreview component %o',
    (filePreview) => {
      const payload = payloadWith(filePreview)

      warnIfStreamPreviewTurnedOff(payload as never)

      expect(payload.logger.warn).not.toHaveBeenCalled()
    },
  )
})
