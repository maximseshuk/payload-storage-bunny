import type { CollectionContext } from '@/types/index.js'
import type { CollectionConfig, Field, GroupField, TextField } from 'payload'

import { dataField, videoIdField, videoResolutionsField } from '@/fields/index.js'
import { getThumbnailURLAfterReadFieldHook, getUrlAfterReadFieldHook } from '@/hooks/index.js'

const getBunnyFields = (collectionContext: CollectionContext): Field[] => {
  if (!collectionContext.streamConfig) {
    return []
  }

  const fields: Field[] = [videoIdField()]

  if (collectionContext.streamConfig.mp4Fallback) {
    fields.push(videoResolutionsField())
  }

  fields.push(dataField())

  return fields
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

  let existingURLFieldIndex = -1
  let existingThumbnailURLFieldIndex = -1

  const existingURLField = fields.find((existingField, i) => {
    if ('name' in existingField && existingField.name === 'url' && existingField.type === 'text') {
      existingURLFieldIndex = i
      return true
    }
    return false
  })

  const existingThumbnailURLField = fields.find((existingField, i) => {
    if ('name' in existingField && existingField.name === 'thumbnailURL' && existingField.type === 'text') {
      existingThumbnailURLFieldIndex = i
      return true
    }
    return false
  })

  if (existingURLFieldIndex !== -1) {
    fields = fields.filter((_, i) => i !== existingURLFieldIndex)
    if (existingThumbnailURLFieldIndex > existingURLFieldIndex) {
      existingThumbnailURLFieldIndex--
    }
  }

  if (existingThumbnailURLFieldIndex !== -1) {
    fields = fields.filter((_, i) => i !== existingThumbnailURLFieldIndex)
  }

  const urlField: TextField = {
    ...baseURLField,
    ...(existingURLField || {}),
    hooks: {
      afterRead: [
        getUrlAfterReadFieldHook({ context: collectionContext }),
        ...(existingURLField && 'hooks' in existingURLField && existingURLField.hooks?.afterRead || []),
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
        ...(existingThumbnailURLField && 'hooks' in existingThumbnailURLField && existingThumbnailURLField.hooks?.afterRead || []),
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
              ...(existingSizeURLField || {}),
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
