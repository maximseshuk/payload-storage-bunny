import type * as tus from 'tus-js-client'

import type { TusAuthResponse } from '@/client/TusUpload/tusAuth.js'

export type UploadStatus = 'checking' | 'completed' | 'error' | 'idle' | 'paused' | 'preparing' | 'uploading'

export type UploadState = {
  authData: null | TusAuthResponse
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

export type FileManagerProps = {
  collectionSlug: string
  isAutoMode?: boolean
  onCancel?: () => void
  onDisableTus: () => void
  preSelectedFile?: File | null
  UploadControls?: React.ReactNode
}
