import type { CollectionConfig, Field, GroupField, SanitizedUploadConfig, SelectField, TextField } from 'payload'

import { bunnyGroupField } from '@/server/payload/fields/bunnyGroupField.js'
import { getThumbnailURLAfterReadFieldHook, getUrlAfterReadFieldHook } from '@/server/payload/fields/hooks.js'
import { PLUGIN_KEY } from '@/shared/constants.js'
import { translations } from '@/shared/translations/index.js'
import type { PluginDefaultTranslationsObject } from '@/shared/translations/types.js'
import type { CollectionContext } from '@/shared/types/index.js'

type TranslationKey = keyof PluginDefaultTranslationsObject[typeof PLUGIN_KEY]

const translated = (key: TranslationKey): Record<string, string> =>
  Object.fromEntries(
    Object.entries(translations).map(([language, translation]) => [language, translation[PLUGIN_KEY][key]]),
  )

const getStreamStatusField = (): SelectField => ({
  name: 'bunnyStream',
  type: 'select',
  access: { create: () => false, update: () => false },
  admin: {
    components: {
      Cell: '@seshuk/payload-storage-bunny/client#StreamStatusCell',
      Field: '@seshuk/payload-storage-bunny/client#StreamStatusField',
    },
    disabled: { bulkEdit: true, groupBy: true },
    position: 'sidebar',
    readOnly: true,
  },
  label: translated('streamStatusColumnLabel'),
  options: [
    { label: translated('streamStatusProcessing'), value: 'processing' },
    { label: translated('streamStatusReady'), value: 'ready' },
    { label: translated('streamStatusFailed'), value: 'failed' },
  ],
  virtual: 'bunnyData.stream.status',
})

const getBunnyFields = (collectionContext: CollectionContext, status: boolean): Field[] => {
  if (!collectionContext.streamOptions) {
    return []
  }

  return [bunnyGroupField(collectionContext, status)]
}

export const getFields = (
  collection: CollectionConfig,
  collectionContext: CollectionContext,
  existingFields: Field[],
): Field[] => {
  const baseURLField: TextField = {
    name: 'url',
    type: 'text',
    admin: {
      hidden: true,
      readOnly: true,
    },
    label: 'URL',
  }

  let fields = [...existingFields]

  const bunnyFields = getBunnyFields(collectionContext, !!collectionContext.streamOptions?.status)
  if (bunnyFields.length > 0) {
    fields.unshift(...bunnyFields)
  }

  const existingURLField = fields.find((field) => 'name' in field && field.name === 'url' && field.type === 'text')
  const existingThumbnailURLField = fields.find(
    (field) => 'name' in field && field.name === 'thumbnailURL' && field.type === 'text',
  )

  fields = fields.filter(
    (field) => !('name' in field && field.type === 'text' && (field.name === 'url' || field.name === 'thumbnailURL')),
  )

  const urlField: TextField = {
    ...baseURLField,
    ...existingURLField,
    hooks: {
      afterRead: [
        getUrlAfterReadFieldHook({ context: collectionContext }),
        ...((existingURLField && 'hooks' in existingURLField && existingURLField.hooks?.afterRead) || []),
      ],
    },
  } as TextField

  const thumbnailURLField: TextField = {
    name: 'thumbnailURL',
    type: 'text',
    admin: {
      hidden: true,
      readOnly: true,
    },
    hooks: {
      afterRead: [
        getThumbnailURLAfterReadFieldHook({ context: collectionContext }),
        ...((existingThumbnailURLField &&
          'hooks' in existingThumbnailURLField &&
          existingThumbnailURLField.hooks?.afterRead) ||
          []),
      ],
    },
    label: 'Thumbnail URL',
  }

  fields.push(urlField, thumbnailURLField)

  const hasDynamicClientUploadPrefix = typeof collectionContext.storageOptions?.clientUploads?.prefix === 'function'
  const existingPrefixField = fields.some((field) => 'name' in field && field.name === 'prefix')

  if (hasDynamicClientUploadPrefix && !existingPrefixField) {
    const prefixField: TextField = {
      name: 'prefix',
      type: 'text',
      access: { create: () => false, update: () => false },
      admin: {
        disabled: { bulkEdit: true, column: true, filter: true, groupBy: true },
        hidden: true,
        readOnly: true,
      },
      defaultValue: collectionContext.prefix ?? '',
    }

    fields.push(prefixField)
  }

  if (
    collectionContext.streamOptions?.status &&
    !fields.some((field) => 'name' in field && field.name === 'bunnyStream')
  ) {
    fields.push(getStreamStatusField())
  }

  const variants =
    typeof collection.upload === 'object' ? (collection.upload as SanitizedUploadConfig).variants : undefined

  if (variants) {
    let existingSizesFieldIndex = -1

    const existingSizesField = fields.find((existingField, i) => {
      if ('name' in existingField && existingField.name === 'variants') {
        existingSizesFieldIndex = i
        return true
      }

      return false
    }) as GroupField

    if (existingSizesFieldIndex > -1) {
      fields.splice(existingSizesFieldIndex, 1)
    }

    const sizesField: Field = {
      ...(existingSizesField && typeof existingSizesField === 'object' ? existingSizesField : {}),
      name: 'variants',
      type: 'group',
      admin: {
        hidden: true,
      },
      fields: variants.map((size) => {
        const existingSizeField = existingSizesField?.fields.find(
          (existingField) => 'name' in existingField && existingField.name === size.name,
        ) as GroupField

        const existingSizeURLField = existingSizeField?.fields.find(
          (existingField) => 'name' in existingField && existingField.name === 'url',
        ) as GroupField

        return {
          ...existingSizeField,
          name: size.name,
          type: 'group',
          fields: [
            ...getBunnyFields(collectionContext, false),
            {
              ...existingSizeURLField,
              ...baseURLField,
              hooks: {
                afterRead: [
                  getUrlAfterReadFieldHook({ context: collectionContext, size }),
                  ...((typeof existingSizeURLField === 'object' &&
                    'hooks' in existingSizeURLField &&
                    existingSizeURLField?.hooks?.afterRead) ||
                    []),
                ],
              },
            },
          ],
        }
      }),
    } as Field

    fields.push(sizesField)
  }

  return fields
}
