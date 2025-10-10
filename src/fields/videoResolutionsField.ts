import type { JSONField } from 'payload'

export const videoResolutionsField = (): JSONField => {
  return {
    name: 'bunnyVideoResolutions',
    type: 'json',
    admin: {
      disableBulkEdit: true,
    },
    hidden: true,
  }
}
