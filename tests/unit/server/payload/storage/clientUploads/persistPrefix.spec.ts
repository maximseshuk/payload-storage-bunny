import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  getBeforeChangeHook,
  getBeforeOperationHook,
} from '@/server/payload/storage/clientUploads/persistPrefixHook.js'
import type { CollectionContext } from '@/shared/types/index.js'

const context = { collection: { slug: 'media' } } as unknown as CollectionContext

const runHooks = async (
  file: unknown,
  data: Record<string, unknown> = {},
  { afterOperation, operation = 'create' }: { afterOperation?: (req: PayloadRequest) => void; operation?: string } = {},
) => {
  const req = { context: {}, file } as unknown as PayloadRequest
  await getBeforeOperationHook(context)({ args: {}, operation, req } as never)
  afterOperation?.(req)
  return getBeforeChangeHook(context)({ data, req } as never)
}

const runHook = (file: unknown, data: Record<string, unknown> = {}) => runHooks(file, data)

describe('getBeforeChangeHook', () => {
  it('writes the sanitized prefix from the verified client upload context', async () => {
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

  it('writes the verified file size and MIME type', async () => {
    const data = await runHook(
      { clientUploadContext: { filesize: 1000, mimeType: 'image/jpeg', prefix: 'tenants/acme' } },
      { filesize: 1, mimeType: 'text/plain' },
    )
    expect(data).toEqual({ filesize: 1000, mimeType: 'image/jpeg', prefix: 'tenants/acme' })
  })

  it('keeps the verified prefix after sharp drops the client upload context', async () => {
    const file = { clientUploadContext: { filesize: 1000, mimeType: 'image/png', prefix: 'tenants/acme' } }
    const data = await runHooks(
      file,
      { filesize: 800, mimeType: 'image/webp' },
      { afterOperation: () => delete (file as { clientUploadContext?: unknown }).clientUploadContext },
    )
    expect(data).toEqual({ filesize: 800, mimeType: 'image/webp', prefix: 'tenants/acme' })
  })

  it('does not apply a prefix stored for another collection', async () => {
    const req = { context: {}, file: { clientUploadContext: { prefix: 'tenants/acme' } } } as unknown as PayloadRequest
    const other = { collection: { slug: 'docs' } } as unknown as CollectionContext
    await getBeforeOperationHook(other)({ args: {}, operation: 'create', req } as never)
    req.file = { name: 'x.png' } as PayloadRequest['file']
    const data = await getBeforeChangeHook(context)({ data: {}, req } as never)
    expect(data.prefix).toBeUndefined()
  })

  it('ignores a clientUploadContext that is not an object', async () => {
    const data = await runHook({ clientUploadContext: 'nope' }, {})
    expect(data.prefix).toBeUndefined()
  })
})
