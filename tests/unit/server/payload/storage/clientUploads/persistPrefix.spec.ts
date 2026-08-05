import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import { getBeforeChangeHook } from '@/server/payload/storage/clientUploads/persistPrefixHook.js'
import type { CollectionContext } from '@/shared/types/index.js'

const context = {} as unknown as CollectionContext

const runHook = (file: unknown, data: Record<string, unknown> = {}) => {
  const hook = getBeforeChangeHook(context)
  const req = { file } as unknown as PayloadRequest
  return hook({ data, req } as never)
}

describe('getBeforeChangeHook', () => {
  it('writes the sanitized prefix from req.file.clientUploadContext', async () => {
    const data = await runHook({ clientUploadContext: { prefix: '/tenants/acme' } })
    expect(data.prefix).toBe('tenants/acme')
  })

  it('drops traversal segments while sanitizing', async () => {
    const data = await runHook({ clientUploadContext: { prefix: 'tenants/../secret' } })
    expect(data.prefix).toBe('tenants/secret')
  })

  it('leaves data.prefix untouched when there is no clientUploadContext', async () => {
    const data = await runHook(undefined, { prefix: 'existing' })
    expect(data.prefix).toBe('existing')
  })

  it('ignores a clientUploadContext without a string prefix', async () => {
    const data = await runHook({ clientUploadContext: { prefix: 123 } }, {})
    expect(data.prefix).toBeUndefined()
  })

  it('ignores a clientUploadContext that is not an object', async () => {
    const data = await runHook({ clientUploadContext: 'nope' }, {})
    expect(data.prefix).toBeUndefined()
  })
})
