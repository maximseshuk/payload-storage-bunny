import { TIMEOUTS, TUS_MIME_TYPES } from '@/utils/constants.js'

export const CONFIG_DEFAULTS = {
  clientUploads: {
    edge: {
      maxSize: 1073741824,
    },
  },
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
      expiresIn: 3600,
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
