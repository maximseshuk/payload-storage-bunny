import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { TusUpload } from '@/client/TusUpload/TusUpload.js'

const state = vi.hoisted(() => ({ bulk: false, tus: undefined as Record<string, unknown> | undefined }))

vi.mock('@payloadcms/ui', () => ({
  useBulkUpload: () => (state.bulk ? { collectionSlug: 'media', modalSlug: 'bulk' } : {}),
  useConfig: () => ({
    getEntityConfig: () => ({
      admin: { custom: { '@seshuk/payload-storage-bunny': { stream: { mimeTypes: ['video/*'], tus: state.tus } } } },
      slug: 'media',
      upload: {},
    }),
  }),
  useDocumentInfo: () => ({ collectionSlug: 'media', initialState: {} }),
  useFormFields: () => undefined,
  useModal: () => ({ isModalOpen: () => true }),
  useUploadControls: () => ({}),
  useUploadEdits: () => ({}),
}))

const fileManager = vi.hoisted(() => async () => {
  const { createElement: h } = await import('react')
  return {
    FileManager: ({ UploadControls }: { UploadControls?: ReactNode }) =>
      h('div', { 'data-controls': '' }, UploadControls),
  }
})

vi.mock('@payloadcms/ui/elements/FileManager', fileManager)
vi.mock('@/client/TusUpload/FileManager/FileManager.js', () => ({ FileManager: () => null }))
vi.mock('@/client/TusUpload/ToggleButton/ToggleButton.js', async () => {
  const { createElement: h } = await import('react')
  return { ToggleButton: () => h('button', null, 'TUS') }
})

const CONTROLS = '<button>Import</button>'

const render = (tus: Record<string, unknown> | undefined, { bulk = false, controls = true } = {}) => {
  state.bulk = bulk
  state.tus = tus
  return renderToStaticMarkup(
    createElement(TusUpload, { UploadControls: controls ? createElement('button', null, 'Import') : undefined }),
  )
}

const slot = (html: string) => `<div style="display:contents"><div data-controls="">${html}</div></div>`

describe('TusUpload controls', () => {
  it('renders the custom upload controls next to the TUS toggle', () => {
    expect(render({})).toBe(slot(`${CONTROLS}<button>TUS</button>`))
  })

  it('renders only the custom upload controls in auto mode', () => {
    expect(render({ autoMode: true })).toBe(slot(CONTROLS))
  })

  it('renders only the custom upload controls without TUS', () => {
    expect(render(undefined)).toBe(slot(CONTROLS))
  })

  it('renders only the TUS toggle without custom upload controls', () => {
    expect(render({}, { controls: false })).toBe(slot('<button>TUS</button>'))
  })

  it('renders no controls in the bulk upload', () => {
    expect(render({}, { bulk: true })).toBe(slot(''))
  })
})
