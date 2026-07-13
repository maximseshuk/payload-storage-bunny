import type { JSONField } from 'payload'

import { setBunnyData } from '@/utils/requestContext.js'

export const videoResolutionsField = (): JSONField => {
  return {
    name: 'bunnyVideoResolutions',
    type: 'json',
    hidden: true,
    hooks: {
      beforeChange: [
        ({ context, value }) => {
          setBunnyData(context, { stream: { resolutions: value } })
          return value
        },
      ],
    },
  }
}
