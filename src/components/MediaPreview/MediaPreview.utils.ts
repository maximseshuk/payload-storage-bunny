import type { DocumentViewerType, PreviewType } from './MediaPreview.types.js'

import { GOOGLE_VIEWER_MAX_SIZE, GOOGLE_VIEWER_TYPES, MICROSOFT_OFFICE_TYPES } from './MediaPreview.constants.js'

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
