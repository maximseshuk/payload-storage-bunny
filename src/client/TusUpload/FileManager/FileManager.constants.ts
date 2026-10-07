import type { UploadState } from './FileManager.types.js'

export const BASE_CLASS = 'storage-bunny-tus-upload'

export const TUS_RETRY_DELAYS = [0, 3000, 5000, 10000, 20000, 60000, 60000]

export const UPLOADED_FILE_PATHS = [
  'bunnyData.stream.videoId',
  'bunnyData.stream.videoToken',
  'filename',
  'filesize',
  'mimeType',
]

export const INITIAL_STATE: UploadState = {
  authData: null,
  canRestore: false,
  estimatedTimeRemaining: null,
  existingVideoId: null,
  fileName: '',
  isFileNameEditable: true,
  selectedFile: null,
  tusData: null,
  uploadError: null,
  uploadProgress: 0,
  uploadStatus: 'idle',
}
