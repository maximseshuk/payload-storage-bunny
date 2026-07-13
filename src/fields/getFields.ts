import type { CollectionConfig, Field, GroupField, TextField } from 'payload'

import { bunnyGroupField } from '@/fields/bunnyGroupField.js'
import { getThumbnailURLAfterReadFieldHook, getUrlAfterReadFieldHook } from '@/fields/hooks.js'
import type { CollectionContext } from '@/types/index.js'

const getBunnyFields = (collectionContext: CollectionContext): Field[] => {
  if (!collectionContext.streamConfig) {
    return []
  }

  return [bunnyGroupField(collectionContext)]
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

  const bunnyFields = getBunnyFields(collectionContext)
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

  if (typeof collection.upload === 'object' && collection.upload.imageSizes) {
    let existingSizesFieldIndex = -1

    const existingSizesField = fields.find((existingField, i) => {
      if ('name' in existingField && existingField.name === 'sizes') {
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
      name: 'sizes',
      type: 'group',
      admin: {
        hidden: true,
      },
      fields: collection.upload.imageSizes.map((size) => {
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
            ...getBunnyFields(collectionContext),
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
