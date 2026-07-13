import type { JSONField } from 'payload'

export const videoResolutionsField = (): JSONField => {
  return {
    name: 'bunnyVideoResolutions',
    type: 'json',
    hidden: true,
  }
}
