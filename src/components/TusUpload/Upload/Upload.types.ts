import type { StreamTusAuthResponse } from '@/types/index.js'
import type * as tus from 'tus-js-client'

export type UploadStatus = 'checking' | 'completed' | 'error' | 'idle' | 'paused' | 'preparing' | 'uploading'

export type UploadState = {
  authData: null | StreamTusAuthResponse
  canRestore: boolean
  estimatedTimeRemaining: null | number
  existingVideoId: null | string
  fileName: string
  isFileNameEditable: boolean
  selectedFile: File | null
  tusData: null | tus.PreviousUpload
  uploadError: null | string
  uploadProgress: number
  uploadStatus: UploadStatus
}
