export const PLUGIN_KEY = '@seshuk/payload-storage-bunny'

export const BUNNY_API = {
  BASE_URL: 'https://api.bunny.net',
  STORAGE_HOSTNAME: 'storage.bunnycdn.com',
  STREAM_URL: 'https://video.bunnycdn.com',
  TUS_ENDPOINT: 'https://video.bunnycdn.com/tusupload',
} as const

export const getStorageUrl = (region?: string): string => {
  if (!region) {
    return `https://${BUNNY_API.STORAGE_HOSTNAME}`
  }
  return `https://${region}.${BUNNY_API.STORAGE_HOSTNAME}`
}

export const TIMEOUTS = {
  DEFAULT: 15000,
  STREAM_UPLOAD: 300000,
  UPLOAD: 120000,
} as const

export const TUS_MIME_TYPES = [
  'video/mp4',
  'video/x-matroska',
  'video/webm',
  'video/x-flv',
  'video/x-ms-vod',
  'video/x-msvideo',
  'video/quicktime',
  'video/x-ms-wmv',
  'video/x-amv',
  'video/mpeg',
  'video/4mv',
  'video/mp2t',
  'video/mxf',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
]
