export const BUNNY_API = {
  BASE_URL: 'https://api.bunny.net',
  STORAGE_HOSTNAME: 'storage.bunnycdn.com',
  STREAM_URL: 'https://video.bunnycdn.com',
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
  'video/mp4', // mp4, m4p (iTunes protected), m4v
  'video/x-matroska', // mkv
  'video/webm', // webm
  'video/x-flv', // flv
  'video/x-ms-vod', // vod (non-standard)
  'video/x-msvideo', // avi
  'video/quicktime', // mov
  'video/x-ms-wmv', // wmv
  'video/x-amv', // amv
  'video/mpeg', // mpeg, mpg
  'video/4mv', // 4mv (rare, non-standard)
  'video/mp2t', // ts
  'video/mxf', // mxf
  'audio/mpeg', // mp3
  'audio/ogg', // ogg
  'audio/wav', // wav
]

export const MEDIA_PREVIEW_MIME_TYPES = [
  // Videos
  'video/*',
  // Images
  'image/*',
  // Documents - Microsoft Office
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-powerpoint', // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  // Documents - Google Viewer
  'application/pdf',
  'text/plain',
  'text/css',
  'text/html',
  'text/php',
  'text/javascript',
  'application/x-javascript',
  'text/x-c',
  'text/x-c++',
  'application/vnd.apple.pages', // .pages
  'application/postscript', // .ai, .eps, .ps
  'image/vnd.adobe.photoshop', // .psd
  'image/vnd.dxf', // .dxf
  'application/dxf', // .dxf
  'image/svg+xml', // .svg
  'application/vnd.ms-xpsdocument', // .xps
]
