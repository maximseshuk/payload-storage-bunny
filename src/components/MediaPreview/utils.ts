export type PreviewType = 'audio' | 'document' | 'image' | 'unsupported' | 'video'
export type DocumentViewerType = 'google' | 'microsoft'

const GOOGLE_VIEWER_MAX_SIZE = 25 * 1024 * 1024

const MICROSOFT_OFFICE_TYPES = [
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-powerpoint', // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
]

const GOOGLE_VIEWER_TYPES = [
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

export const getPreviewType = (mimeType?: string): PreviewType => {
  if (!mimeType) {
    return 'unsupported'
  }

  if (mimeType.startsWith('video/')) {
    return 'video'
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio'
  }
  if (mimeType.startsWith('image/')) {
    return 'image'
  }

  if (MICROSOFT_OFFICE_TYPES.includes(mimeType) || GOOGLE_VIEWER_TYPES.includes(mimeType)) {
    return 'document'
  }

  return 'unsupported'
}

export const getDocumentViewerType = (mimeType: string): DocumentViewerType => {
  if (MICROSOFT_OFFICE_TYPES.includes(mimeType)) {
    return 'microsoft'
  }
  return 'google'
}

export const canPreviewDocument = (fileSize?: number): boolean => {
  if (!fileSize) {
    return true
  }
  return fileSize <= GOOGLE_VIEWER_MAX_SIZE
}

export const getMicrosoftViewerUrl = (fileUrl: string): string => {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`
}

export const getGoogleViewerUrl = (fileUrl: string): string => {
  return `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`
}
