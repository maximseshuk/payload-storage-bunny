import { type Mock, vi } from 'vitest'

type KyMethods = Record<'delete' | 'get' | 'post' | 'put', Mock>

export const kyMethods: KyMethods = {
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}

export const mockKy = async (
  importOriginal: () => Promise<typeof import('ky')>,
): Promise<Omit<typeof import('ky'), 'default'> & { default: { create: () => KyMethods } }> => ({
  ...(await importOriginal()),
  default: { create: () => kyMethods },
})
