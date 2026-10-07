import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { TusUploadServer } from '@/rsc/TusUploadServer.js'

vi.mock('@/client/TusUpload/TusUpload.js', () => ({ TusUpload: () => null }))

const PREVIEW_PATH = '@seshuk/payload-plugin-media-preview/rsc#MediaPreviewFile'
const CONTROLS_PATH = '/components/Controls#Controls'
const FilePreview = () => null
const Controls = () => null

const doc = { filename: 'clip.mp4', filesize: 10, height: 720, mimeType: 'video/mp4', url: '/clip.mp4', width: 1280 }

const render = async (
  filePreview: unknown,
  id: null | number = 7,
  locale?: unknown,
  findByID = vi.fn(async (_args: Record<string, unknown>): Promise<unknown> => doc),
  controls?: unknown[],
) => {
  const logger = { error: vi.fn() }
  const payload = {
    collections: { media: { config: { upload: { admin: { components: { controls, filePreview } } } } } },
    findByID,
    importMap: { [CONTROLS_PATH]: Controls, [PREVIEW_PATH]: FilePreview },
    logger,
  }
  const element = (await TusUploadServer({
    id: id ?? undefined,
    collectionSlug: 'media',
    locale,
    payload,
  } as never)) as ReactElement<{
    UploadControls?: ReactElement<object, (props: object) => ReactElement<Record<string, unknown>>[]>
    UploadFilePreview?: ReactElement<object, (props: object) => ReactElement<Record<string, unknown>>>
  }>
  const slot = element.props.UploadFilePreview
  const controlsSlot = element.props.UploadControls
  return {
    controls: controlsSlot && controlsSlot.type(controlsSlot.props),
    findByID,
    logger,
    preview: slot && slot.type(slot.props),
  }
}

describe('TusUploadServer', () => {
  it('passes no file preview and skips the query when the collection has none', async () => {
    const { findByID, preview } = await render(undefined)

    expect(preview).toBeUndefined()
    expect(findByID).not.toHaveBeenCalled()
  })

  it('renders the filePreview that matches the document MIME type, like the default upload', async () => {
    const { findByID, preview } = await render({
      'image/*': false,
      'video/*': { path: PREVIEW_PATH, serverProps: { collectionSlug: 'media' } },
    })

    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, collection: 'media', depth: 0, overrideAccess: false }),
    )
    expect(preview?.type).toBe(FilePreview)
    expect(preview?.props).toMatchObject({
      collectionSlug: 'media',
      filename: 'clip.mp4',
      fileSrc: '/clip.mp4',
      mimeType: 'video/mp4',
    })
  })

  it('reads the latest draft in the locale of the edit view, like the document view', async () => {
    const { findByID } = await render(PREVIEW_PATH, 7, { code: 'de', fallbackLocale: 'en' })

    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ draft: true, fallbackLocale: false, locale: 'de' }))
  })

  it('reads the whole document, also from the trash, like the document view', async () => {
    const { findByID } = await render(PREVIEW_PATH)

    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ trash: true }))
    expect(findByID.mock.lastCall?.[0]).not.toHaveProperty('select')
  })

  it('logs a failed document query and still renders the preview', async () => {
    const err = new Error('boom')
    const { logger, preview } = await render(
      PREVIEW_PATH,
      7,
      undefined,
      vi.fn(async () => {
        throw err
      }),
    )

    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err }))
    expect(preview?.type).toBe(FilePreview)
    expect(preview?.props).toMatchObject({ mimeType: '' })
  })

  it('renders a single filePreview component for every MIME type', async () => {
    const { preview } = await render(PREVIEW_PATH)

    expect(preview?.type).toBe(FilePreview)
  })

  it('keeps the built-in preview when the MIME type maps to false', async () => {
    const { preview } = await render({ '*': PREVIEW_PATH, 'video/*': false })

    expect(preview).toBeUndefined()
  })

  it.each([
    ['next to a filePreview', PREVIEW_PATH],
    ['without a filePreview', undefined],
    ['when no filePreview matches', { 'image/*': PREVIEW_PATH }],
  ])('renders the custom upload controls with the server props %s', async (_, filePreview) => {
    const { controls } = await render(filePreview, 7, undefined, undefined, [
      { path: CONTROLS_PATH, clientProps: { label: 'Import' } },
    ])

    expect(controls).toHaveLength(1)
    expect(controls?.[0]?.type).toBe(Controls)
    expect(controls?.[0]?.props).toMatchObject({ id: 7, collectionSlug: 'media', label: 'Import' })
  })

  it('passes no upload controls when the collection has none', async () => {
    const { controls } = await render(PREVIEW_PATH)

    expect(controls).toBeUndefined()
  })

  it('does not query a document on create', async () => {
    const { findByID } = await render(PREVIEW_PATH, null)

    expect(findByID).not.toHaveBeenCalled()
  })
})
