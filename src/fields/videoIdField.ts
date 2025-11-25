import type { TextField } from 'payload'

export const videoIdField = (): TextField => ({
  name: 'bunnyVideoId',
  type: 'text',
  admin: {
    disabled: true,
    hidden: true,
  },
})
