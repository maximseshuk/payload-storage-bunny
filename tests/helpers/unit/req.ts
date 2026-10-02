import { type Mock, vi } from 'vitest'

export const t = (key: string, vars?: Record<string, unknown>): string =>
  vars ? `${key}:${JSON.stringify(vars)}` : key

export const createReq = (): { payload: { logger: { debug: Mock; error: Mock } }; t: typeof t } => ({
  payload: { logger: { debug: vi.fn(), error: vi.fn() } },
  t,
})
