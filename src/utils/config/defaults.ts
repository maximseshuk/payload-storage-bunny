import { TIMEOUTS, TUS_MIME_TYPES } from '../constants.js'

export const CONFIG_DEFAULTS = {
  purge: {
    async: false,
  },
  signedUrls: {
    expiresIn: 7200,
  },
  storage: {
    uploadTimeout: TIMEOUTS.UPLOAD,
  },
  stream: {
    cleanup: {
      maxAge: 86400,
      schedule: {
        cron: '0 2 * * *',
        queue: 'storage-bunny',
      },
    },
    mimeTypes: TUS_MIME_TYPES,
    mp4Fallback: false,
    tus: {
      autoMode: true,
      mimeTypes: TUS_MIME_TYPES,
      uploadTimeout: 3600,
    },
    uploadTimeout: TIMEOUTS.STREAM_UPLOAD,
  },
  thumbnail: {
    appendTimestamp: true,
    queryParams: {},
    streamAnimated: false,
  },
  urlTransform: {
    appendTimestamp: false,
    queryParams: {},
  },
} as const
