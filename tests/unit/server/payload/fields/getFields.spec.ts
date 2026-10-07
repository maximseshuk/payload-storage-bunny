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
    const fields = getFields(collection, context({ storageOptions: dynamicPrefixStorage } as never), [])

    const prefixField = getField(fields, 'prefix') as { admin?: Record<string, unknown>; defaultValue?: unknown }
    expect(prefixField).toBeDefined()
    expect(prefixField.admin).toMatchObject({ hidden: true, readOnly: true })
    expect(prefixField).not.toHaveProperty('hidden')
    expect(prefixField.defaultValue).toBe('')
  })

  it('hides the injected prefix field from list columns, filters, group-by and bulk edit', () => {
    const fields = getFields(collection, context({ storageOptions: dynamicPrefixStorage } as never), [])

    expect((getField(fields, 'prefix') as { admin?: Record<string, unknown> }).admin?.disabled).toEqual({
      bulkEdit: true,
      column: true,
      filter: true,
      groupBy: true,
    })
  })

  it('does not accept a prefix from create or update input', () => {
    const fields = getFields(collection, context({ storageOptions: dynamicPrefixStorage } as never), [])

    const prefixField = getField(fields, 'prefix') as { access?: Record<string, () => boolean> }
    expect(prefixField.access?.create?.()).toBe(false)
    expect(prefixField.access?.update?.()).toBe(false)
  })

  it('uses the static collection prefix as the field defaultValue', () => {
    const fields = getFields(
      collection,
      context({ prefix: 'media', storageOptions: dynamicPrefixStorage } as never),
      [],
    )

    const prefixField = getField(fields, 'prefix') as { defaultValue?: unknown }
    expect(prefixField.defaultValue).toBe('media')
  })

  it('does not inject a prefix field when clientUploads.prefix is not a function', () => {
    const fields = getFields(
      collection,
      context({
        storageOptions: { ...dynamicPrefixStorage, clientUploads: {} },
      } as never),
      [],
    )

    expect(hasField(fields, 'prefix')).toBe(false)
  })

  it('does not inject a prefix field when clientUploads is absent', () => {
    const fields = getFields(
      collection,
      context({ storageOptions: { ...dynamicPrefixStorage, clientUploads: undefined } } as never),
      [],
    )
    expect(hasField(fields, 'prefix')).toBe(false)
  })

  it('does not duplicate an existing prefix field', () => {
    const existing: Field[] = [{ name: 'prefix', type: 'text' }]
    const fields = getFields(collection, context({ storageOptions: dynamicPrefixStorage } as never), existing)

    const prefixFields = fields.filter((f) => 'name' in f && f.name === 'prefix')
    expect(prefixFields).toHaveLength(1)
  })
})

describe('getFields Bunny Stream status field', () => {
  const streamOptions = { libraryId: 703889, status: true }

  it('adds a read-only virtual select field for the stored status when the collection uses Bunny Stream', () => {
    const fields = getFields(collection, context({ streamOptions } as never), [])
    const field = getField(fields, 'bunnyStream') as unknown as {
      access: { create: () => boolean; update: () => boolean }
      options: { label: Record<string, string>; value: string }[]
    }

    expect(field).toMatchObject({
      type: 'select',
      admin: {
        components: {
          Cell: '@seshuk/payload-storage-bunny/client#StreamStatusCell',
          Field: '@seshuk/payload-storage-bunny/client#StreamStatusField',
        },
        disabled: { bulkEdit: true, groupBy: true },
        position: 'sidebar',
        readOnly: true,
      },
      label: expect.objectContaining({ de: 'Stream-Status', en: 'Stream Status' }),
      virtual: 'bunnyData.stream.status',
    })
    expect(field.options.map((option) => [option.value, option.label.en])).toEqual([
      ['processing', 'Processing'],
      ['ready', 'Ready'],
      ['failed', 'Failed'],
    ])
    expect(field.access.create()).toBe(false)
    expect(field.access.update()).toBe(false)
  })

  it('does not add the field when the collection does not use Bunny Stream', () => {
    const fields = getFields(collection, context({ storageOptions: dynamicPrefixStorage } as never), [])

    expect(hasField(fields, 'bunnyStream')).toBe(false)
  })

  it('does not add the field when the collection has the status turned off', () => {
    const fields = getFields(collection, context({ streamOptions: { libraryId: 703889, status: false } } as never), [])

    expect(hasField(fields, 'bunnyStream')).toBe(false)
  })

  it('does not replace an existing bunnyStream field', () => {
    const existing: Field[] = [{ name: 'bunnyStream', type: 'text' }]
    const fields = getFields(collection, context({ streamOptions } as never), existing)

    expect(fields.filter((f) => 'name' in f && f.name === 'bunnyStream')).toEqual(existing)
  })
})
