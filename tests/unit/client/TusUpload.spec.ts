import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TusUpload } from '@/client/TusUpload/TusUpload.js'

const state = vi.hoisted(() => ({
  bulk: false,
  cursor: 0,
  deps: [] as unknown[][],
  dispatchFields: vi.fn(),
  effectCursor: 0,
  field: undefined as { value: File } | undefined,
  preSelectedFile: undefined as File | null | undefined,
  states: [] as unknown[],
  tus: undefined as Record<string, unknown> | undefined,
}))

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  return {
    ...react,
    useEffect: (effect: () => void, deps: unknown[]) => {
      const index = state.effectCursor++
      if (!state.deps[index]?.every((dep, i) => Object.is(dep, deps[i]))) {
        state.deps[index] = deps
        effect()
      }
    },
    useState: <T>(initial: T) => {
      const index = state.cursor++
      if (!(index in state.states)) {
        state.states[index] = initial
      }
      return [state.states[index], (value: T) => void (state.states[index] = value)]
    },
  }
})

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
  useForm: () => ({ dispatchFields: state.dispatchFields }),
  useFormFields: (selector: (state: [Record<string, unknown>]) => unknown) => selector([{ file: state.field }]),
  useModal: () => ({ isModalOpen: () => true }),
  useUploadControls: () => ({ setUploadControlFile() {}, setUploadControlFileName() {}, setUploadControlFileUrl() {} }),
  useUploadEdits: () => ({ resetUploadEdits() {} }),
}))

const fileManager = vi.hoisted(() => async () => {
  const { createElement: h } = await import('react')
  return {
    FileManager: ({ UploadControls }: { UploadControls?: ReactNode }) =>
      h('div', { 'data-controls': '' }, UploadControls),
  }
})

vi.mock('@payloadcms/ui/elements/FileManager', fileManager)
vi.mock('@/client/TusUpload/FileManager/FileManager.js', () => ({
  FileManager: (props: { preSelectedFile?: File | null; UploadControls?: ReactNode }) => {
    state.preSelectedFile = props.preSelectedFile
    return props.UploadControls ?? null
  },
}))
vi.mock('@/client/TusUpload/ToggleButton/ToggleButton.js', async () => {
  const { createElement: h } = await import('react')
  return { ToggleButton: () => h('button', null, 'TUS') }
})

const CONTROLS = '<button>Import</button>'

const render = (tus: Record<string, unknown> | undefined, { bulk = false, controls = true } = {}) => {
  state.bulk = bulk
  state.tus = tus
  state.cursor = 0
  state.effectCursor = 0
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

describe('TusUpload form file', () => {
  const video = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
  const clearFile = { type: 'UPDATE', path: 'file', value: null }

  beforeEach(() => {
    state.dispatchFields.mockClear()
    state.deps = []
    state.field = undefined
    state.states = []
  })

  it('clears the form file when auto mode switches to TUS and the remove button is not found', async () => {
    state.field = { value: video }
    render({ autoMode: true })
    expect(state.dispatchFields).not.toHaveBeenCalled()

    await vi.waitFor(() => expect(state.states[0]).toBe(true))
    render({ autoMode: true })

    expect(state.states[1]).toBe(video)
    expect(state.dispatchFields).toHaveBeenCalledWith(clearFile)
  })

  it('clears a file that reaches the hidden form field while TUS mode is on and hands it to the TUS upload', () => {
    const photo = new File(['image'], 'photo.jpg', { type: 'image/jpeg' })
    state.states = [true, null]
    state.field = { value: photo }
    render({})

    expect(state.dispatchFields).toHaveBeenCalledWith(clearFile)
    expect(state.preSelectedFile).toBe(photo)
  })

  it('clears the form file again when the same file comes back into the form field', () => {
    state.states = [true, null]
    state.field = { value: video }
    render({})
    render({})
    expect(state.dispatchFields).toHaveBeenCalledOnce()

    state.field = { value: video }
    render({})

    expect(state.dispatchFields).toHaveBeenCalledTimes(2)
    expect(state.dispatchFields).toHaveBeenLastCalledWith(clearFile)
  })

  it('renders the custom upload controls in TUS mode', () => {
    state.states = [true, null]
    expect(render({})).toBe(
      `<div style="display:none"><div data-controls="">${CONTROLS}<button>TUS</button></div></div>${CONTROLS}`,
    )
  })

  it('keeps the form file when TUS mode is off', () => {
    state.field = { value: new File(['image'], 'photo.jpg', { type: 'image/jpeg' }) }
    render({ autoMode: true })

    expect(state.dispatchFields).not.toHaveBeenCalled()
  })

  it('does nothing in TUS mode without a form file', () => {
    state.states = [true, null]
    render({})

    expect(state.dispatchFields).not.toHaveBeenCalled()
  })
})
