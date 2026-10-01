import { Forbidden, type PayloadRequest } from 'payload'
import { createClientUploadReceipt } from 'payload/internal'
import { describe, expect, it } from 'vitest'

import {
  getBeforeChangeHook,
  getBeforeOperationHook,
} from '@/server/payload/storage/clientUploads/persistPrefixHook.js'
import { signClientUpload } from '@/server/payload/storage/clientUploads/receipt.js'
import type { CollectionContext } from '@/shared/types/index.js'

const context = { collection: { slug: 'media' } } as unknown as CollectionContext

const payload = { secret: 'payload-secret' }

const signed = (
  prefix: string,
  claims: Record<string, unknown> = {},
  { collectionSlug = 'media', filename = 'photo.png' } = {},
) => ({
  name: 'photo.png',
  uploadReference: {
    prefix,
    signedReceipt: signClientUpload({ claims, collectionSlug, filename, prefix, req: { payload } as never }),
  },
})

const runHooks = async (
  file: unknown,
  data: Record<string, unknown> = {},
  { afterOperation, operation = 'create' }: { afterOperation?: (req: PayloadRequest) => void; operation?: string } = {},
) => {
  const req = { context: {}, file, payload, t: (key: string) => key } as unknown as PayloadRequest
  await getBeforeOperationHook(context)({ args: {}, operation, req } as never)
  afterOperation?.(req)
  return getBeforeChangeHook(context)({ data, req } as never)
}

const runHook = (file: unknown, data: Record<string, unknown> = {}) => runHooks(file, data)

describe('getBeforeChangeHook', () => {
  it('writes the sanitized prefix from the verified upload reference', async () => {
    const data = await runHook(signed('/tenants/acme'))
    expect(data.prefix).toBe('tenants/acme')
  })

  it('drops traversal segments while sanitizing', async () => {
    const data = await runHook(signed('tenants/../secret'))
    expect(data.prefix).toBe('tenants/secret')
  })

  it('leaves data.prefix untouched when there is no upload reference', async () => {
    const data = await runHook({ name: 'photo.png' }, { prefix: 'existing' })
    expect(data.prefix).toBe('existing')
  })

  it('trusts the signed prefix, not the prefix the client sent next to it', async () => {
    const file = signed('tenants/acme')
    file.uploadReference.prefix = 'tenants/other'
    const data = await runHook(file)
    expect(data.prefix).toBe('tenants/acme')
  })

  it.each([
    ['no receipt', { prefix: 'tenants/acme' }],
    ['a forged receipt', { prefix: 'tenants/acme', signedReceipt: 'forged.receipt' }],
    ['a non-object reference', 'nope'],
  ])('rejects an upload reference with %s', async (_label, uploadReference) => {
    await expect(runHook({ name: 'photo.png', uploadReference })).rejects.toBeInstanceOf(Forbidden)
  })

  it('rejects a receipt issued for another file name', async () => {
    await expect(runHook(signed('tenants/acme', {}, { filename: 'other.png' }))).rejects.toBeInstanceOf(Forbidden)
  })

  it('rejects a Payload receipt signed with another secret', async () => {
    const signedReceipt = createClientUploadReceipt({
      collectionSlug: 'media',
      filename: 'photo.png',
      filePrefix: 'tenants/acme',
      req: { payload: { secret: 'other-secret' } } as never,
      storageFilePath: '{}',
    })
    await expect(
      runHook({ name: 'photo.png', uploadReference: { prefix: 'tenants/acme', signedReceipt } }),
    ).rejects.toBeInstanceOf(Forbidden)
  })

  it('writes the verified file size and MIME type', async () => {
    const data = await runHook(signed('tenants/acme', { filesize: 1000, mimeType: 'image/jpeg' }), {
      filesize: 1,
      mimeType: 'text/plain',
    })
    expect(data).toEqual({ filesize: 1000, mimeType: 'image/jpeg', prefix: 'tenants/acme' })
  })

  it('keeps the verified prefix after sharp drops the upload reference', async () => {
    const file = signed('tenants/acme', { filesize: 1000, mimeType: 'image/png' })
    const data = await runHooks(
      file,
      { filesize: 800, mimeType: 'image/webp' },
      { afterOperation: () => delete (file as { uploadReference?: unknown }).uploadReference },
    )
    expect(data).toEqual({ filesize: 800, mimeType: 'image/webp', prefix: 'tenants/acme' })
  })

  it('does not apply a prefix stored for another collection', async () => {
    const req = {
      context: {},
      file: signed('tenants/acme', {}, { collectionSlug: 'docs' }),
      payload,
      t: (key: string) => key,
    } as unknown as PayloadRequest
    const other = { collection: { slug: 'docs' } } as unknown as CollectionContext
    await getBeforeOperationHook(other)({ args: {}, operation: 'create', req } as never)
    req.file = { name: 'x.png' } as PayloadRequest['file']
    const data = await getBeforeChangeHook(context)({ data: {}, req } as never)
    expect(data.prefix).toBeUndefined()
  })

  it('rejects a receipt issued for another collection', async () => {
    await expect(runHook(signed('tenants/acme', {}, { collectionSlug: 'docs' }))).rejects.toBeInstanceOf(Forbidden)
  })
})
