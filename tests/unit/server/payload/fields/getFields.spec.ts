import type { CollectionConfig, Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { getFields } from '@/server/payload/fields/getFields.js'
import type { CollectionContext } from '@/shared/types/index.js'

const collection = { slug: 'media' } as unknown as CollectionConfig

const context = (over: Partial<CollectionContext> = {}): CollectionContext =>
  ({
    collection,
    isTusUploadSupported: false,
    prefix: '',
    usePayloadAccessControl: true,
    ...over,
  }) as unknown as CollectionContext

const dynamicPrefixStorage = {
  apiKey: 'k',
  clientUploads: { prefix: () => 'tenants/acme' },
  hostname: 'cdn.b-cdn.net',
  uploadTimeout: 60000,
  zoneName: 'z',
}

const hasField = (fields: Field[], name: string) => fields.some((f) => 'name' in f && f.name === name)

const getField = (fields: Field[], name: string) => fields.find((f) => 'name' in f && f.name === name)

describe('getFields prefix injection', () => {
  it('injects a hidden readOnly prefix field when clientUploads.prefix is a function', () => {
    const fields = getFields(collection, context({ storageConfig: dynamicPrefixStorage } as never), [])

    const prefixField = getField(fields, 'prefix') as { admin?: Record<string, unknown>; defaultValue?: unknown }
    expect(prefixField).toBeDefined()
    expect(prefixField.admin).toMatchObject({ hidden: true, readOnly: true })
    expect(prefixField).not.toHaveProperty('hidden')
    expect(prefixField.defaultValue).toBe('')
  })

  it('uses the static collection prefix as the field defaultValue', () => {
    const fields = getFields(collection, context({ prefix: 'media', storageConfig: dynamicPrefixStorage } as never), [])

    const prefixField = getField(fields, 'prefix') as { defaultValue?: unknown }
    expect(prefixField.defaultValue).toBe('media')
  })

  it('does not inject a prefix field when clientUploads.prefix is not a function', () => {
    const fields = getFields(
      collection,
      context({
        storageConfig: { ...dynamicPrefixStorage, clientUploads: {} },
      } as never),
      [],
    )

    expect(hasField(fields, 'prefix')).toBe(false)
  })

  it('does not inject a prefix field when clientUploads is absent', () => {
    const fields = getFields(
      collection,
      context({ storageConfig: { ...dynamicPrefixStorage, clientUploads: undefined } } as never),
      [],
    )
    expect(hasField(fields, 'prefix')).toBe(false)
  })

  it('does not duplicate an existing prefix field', () => {
    const existing: Field[] = [{ name: 'prefix', type: 'text' }]
    const fields = getFields(collection, context({ storageConfig: dynamicPrefixStorage } as never), existing)

    const prefixFields = fields.filter((f) => 'name' in f && f.name === 'prefix')
    expect(prefixFields).toHaveLength(1)
  })
})
