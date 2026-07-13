import type { TextField } from 'payload'

import { setBunnyData } from '@/utils/requestContext.js'

export const videoIdField = (): TextField => ({
  name: 'bunnyVideoId',
  type: 'text',
  admin: {
    disabled: true,
    hidden: true,
  },
  hooks: {
    beforeChange: [
      ({ context, value }) => {
        setBunnyData(context, { stream: { videoId: value } })
        return value
      },
    ],
  },
})
