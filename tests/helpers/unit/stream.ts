import { vi } from 'vitest'

import { createBaseStream, createOwnStream } from './optionsBuilders.js'

type Overrides = Record<string, unknown>

export const multiLibraryOptions = ({
  alpha,
  beta,
  gamma,
  stream,
}: { alpha?: Overrides; beta?: Overrides; gamma?: Overrides; stream?: Overrides } = {}) => ({
  collections: {
    alpha: { disablePayloadAccessControl: true, stream: createOwnStream(111, alpha) },
    beta: { disablePayloadAccessControl: true, stream: createOwnStream(222, beta) },
    ...(gamma && { gamma: { disablePayloadAccessControl: true, stream: createOwnStream(333, gamma) } }),
  },
  ...(stream && { stream: { ...createBaseStream(), ...stream } }),
})

export const buildStreamReq = ({
  collections = { media: { upload: { mimeTypes: ['video/mp4'] } } },
  payload,
  ...req
}: { collections?: Record<string, Overrides>; payload?: Overrides } & Overrides = {}) =>
  ({
    payload: {
      collections: Object.fromEntries(
        Object.entries(collections).map(([slug, config]) => [slug, { config: { slug, ...config } }]),
      ),
      logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
      secret: 'payload-secret',
      ...payload,
    },
    t: (key: string) => key,
    ...req,
  }) as never
