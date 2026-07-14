import type { CollectionConfig } from 'payload'

export const createMediaCollection = (
  config: {
    upload?: Omit<NonNullable<CollectionConfig['upload']>, 'disableLocalStorage' | 'skipSafeFetch'>
  } & Omit<CollectionConfig, 'fields' | 'upload'> &
    Partial<Pick<CollectionConfig, 'fields'>>,
): CollectionConfig => {
  const { fields = [], upload, ...rest } = config

  return {
    access: {
      read: () => true,
    },
    fields: [
      {
        name: 'alt',
        type: 'text',
        required: true,
      },
      ...fields,
    ],
    upload: {
      disableLocalStorage: true,
      skipSafeFetch: true,
      ...upload,
    },
    ...rest,
  }
}
