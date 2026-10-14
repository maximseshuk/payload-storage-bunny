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
  it('injects a hidden prefix field that input cannot set when clientUploads.prefix is a function', () => {
    const fields = getFields(collection, context({ storageOptions: dynamicPrefixStorage } as never), [])

    const prefixField = getField(fields, 'prefix') as {
      access?: Record<string, () => boolean>
      admin?: Record<string, unknown>
      defaultValue?: unknown
    }
    expect(prefixField).toBeDefined()
    expect(prefixField.admin).toMatchObject({
      disabled: { bulkEdit: true, column: true, filter: true, groupBy: true },
      hidden: true,
      readOnly: true,
    })
    expect(prefixField).not.toHaveProperty('hidden')
    expect(prefixField.defaultValue).toBe('')
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

  it.each([
    ['is not a function', {}],
    ['is absent', undefined],
  ])('does not inject a prefix field when clientUploads.prefix %s', (_, clientUploads) => {
    const fields = getFields(
      collection,
      context({ storageOptions: { ...dynamicPrefixStorage, clientUploads } } as never),
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

  it.each([
    ['does not use Bunny Stream', { storageOptions: dynamicPrefixStorage }],
    ['has the status turned off', { streamOptions: { libraryId: 703889, status: false } }],
  ])('does not add the field when the collection %s', (_, over) => {
    const fields = getFields(collection, context(over as never), [])

    expect(hasField(fields, 'bunnyStream')).toBe(false)
  })

  it('does not replace an existing bunnyStream field', () => {
    const existing: Field[] = [{ name: 'bunnyStream', type: 'text' }]
    const fields = getFields(collection, context({ streamOptions } as never), existing)

    expect(fields.filter((f) => 'name' in f && f.name === 'bunnyStream')).toEqual(existing)
  })
})
