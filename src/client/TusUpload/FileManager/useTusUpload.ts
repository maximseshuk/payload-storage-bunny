'use client'

import {
  toast,
  useConfig,
  useDocumentEvents,
  useForm,
  useFormBackgroundProcessing,
  useFormFields,
  useTranslation,
} from '@payloadcms/ui'
import type { FormState } from 'payload'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as tus from 'tus-js-client'

import type { TusAuthResponse } from '@/client/TusUpload/tusAuth.js'
import {
  getFinishedTusUpload,
  getTusAuthUrl,
  isLostTusUpload,
  renewTusHeaders,
  requestTusAuth,
  shouldRetryTusRequest,
} from '@/client/TusUpload/tusAuth.js'
import { TUS_MIME_TYPES } from '@/shared/constants.js'
import { matchesMimeTypePattern } from '@/shared/mimeTypes.js'
import type { PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys } from '@/shared/translations/index.js'

import { INITIAL_STATE, TUS_RETRY_DELAYS, UPLOADED_FILE_PATHS } from './FileManager.constants.js'
import type { FileManagerProps, UploadState } from './FileManager.types.js'
import { cleanupTusLocalStorage, findPreviousTusUploads } from './FileManager.utils.js'

export const useTusUpload = ({
  collectionSlug,
  isAutoMode = false,
  onCancel,
  onDisableTus,
  preSelectedFile,
}: Omit<FileManagerProps, 'UploadControls'>): {
  acceptMimeTypes: string
  handleFileNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleFileRemoval: () => void
  handleFileSelection: (files: File | FileList) => Promise<void>
  inputRef: React.RefObject<HTMLInputElement | null>
  pauseUpload: () => void
  previewSrc: null | string
  restoreUpload: () => Promise<void>
  resumeUpload: () => void
  retryUpload: () => Promise<void>
  startNewUpload: () => Promise<void>
  startOver: () => void
  state: UploadState
} => {
  const [state, setState] = useState<UploadState>(INITIAL_STATE)
  const inputRef = useRef<HTMLInputElement>(null)
  const tusUploadRef = useRef<null | tus.Upload>(null)
  const processedFileRef = useRef<File | null>(null)
  const preSelectedFilesRef = useRef(new WeakSet<File>())
  const uploadStartTimeRef = useRef<null | number>(null)
  const startingBytesRef = useRef<number>(0)
  const prevUpdatedAtRef = useRef<null | string>(null)
  const selectedFileRef = useRef<File | null>(null)
  const mountedRef = useRef(false)
  const previousVideoFieldsRef = useRef<null | Partial<FormState>>(null)
  const uploadedVideoFieldsRef = useRef<null | Record<string, unknown>>(null)
  const replaceLostUploadRef = useRef<(videoId: string, videoToken: string) => void>(() => {})
  const tusDataRef = useRef<null | tus.PreviousUpload>(null)

  const { dispatchFields, getFields, setBackgroundProcessing, setModified } = useForm()
  const backgroundProcessing = useFormBackgroundProcessing()
  const { t } = useTranslation<PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys>()
  const { mostRecentUpdate } = useDocumentEvents()
  const isUploadReverted = useFormFields(([fields]) => {
    const uploaded = uploadedVideoFieldsRef.current
    return !!uploaded && UPLOADED_FILE_PATHS.some((path) => fields[path]?.value !== uploaded[path])
  })
  const {
    config: {
      routes: { api },
      serverURL,
    },
    getEntityConfig,
  } = useConfig()

  const collectionConfig = useMemo(() => getEntityConfig({ collectionSlug }), [collectionSlug, getEntityConfig])
  const allowedMimeTypes =
    collectionConfig?.admin?.custom?.['@seshuk/payload-storage-bunny']?.stream?.mimeTypes ?? TUS_MIME_TYPES
  const drafts = collectionConfig?.versions && collectionConfig.versions.drafts
  const hasAutosave = typeof drafts === 'object' && !!drafts.autosave

  const acceptMimeTypes = allowedMimeTypes.join(', ')

  const updateState = useCallback((updates: Partial<UploadState>) => {
    setState((prev) => ({ ...prev, ...updates }))
  }, [])

  const resetState = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  const isSelected = (file: File) => mountedRef.current && selectedFileRef.current === file

  const writeVideoFields = useCallback(
    (values: Record<string, unknown>) => {
      const fields = getFields()
      dispatchFields({
        type: 'UPDATE_MANY',
        formState: Object.fromEntries(
          Object.entries(values).map(([path, value]) => [path, { ...fields[path], isModified: true, value }]),
        ),
      })
    },
    [dispatchFields, getFields],
  )

  const updateVideoFields = useCallback(
    ({ videoId, videoToken }: TusAuthResponse, file: File) => {
      const tusData = tusDataRef.current
      const values = {
        'bunnyData.stream.videoId': videoId,
        'bunnyData.stream.videoToken': videoToken,
        filename: tusData?.metadata?.title || file.name,
        filesize: tusData?.size || file.size,
        focalX: null,
        focalY: null,
        height: null,
        mimeType: tusData?.metadata?.filetype || file.type,
        width: null,
      }
      const fields = getFields()
      previousVideoFieldsRef.current ??= Object.fromEntries(Object.keys(values).map((path) => [path, fields[path]]))
      uploadedVideoFieldsRef.current = values
      writeVideoFields(values)
      setBackgroundProcessing(false)
      setModified(true)
    },
    [getFields, setBackgroundProcessing, setModified, writeVideoFields],
  )

  const tusAuthUrl = getTusAuthUrl(serverURL, api)

  const getAuthRequest = useCallback(
    (file: File, videoId?: string, videoToken?: string) => ({
      collection: collectionSlug,
      filename: file.name,
      filesize: state.tusData?.size || file.size,
      filetype: file.type,
      title: state.fileName,
      videoId,
      videoToken,
    }),
    [collectionSlug, state.fileName, state.tusData],
  )

  const getAuthData = useCallback(
    (file: File, existingVideoId?: string, existingVideoToken?: string): Promise<TusAuthResponse> =>
      requestTusAuth(tusAuthUrl, getAuthRequest(file, existingVideoId, existingVideoToken)),
    [getAuthRequest, tusAuthUrl],
  )

  const handleVideoIdMismatch = useCallback(
    async (file: File, existingVideoId: string, newVideoId: string) => {
      if (existingVideoId !== newVideoId) {
        await cleanupTusLocalStorage(file, existingVideoId)

        updateState({
          canRestore: false,
          existingVideoId: null,
          tusData: null,
        })
      }
    },
    [updateState],
  )

  const handleUploadSuccess = useCallback(
    (authData: TusAuthResponse, file: File) => {
      if (!isSelected(file)) {
        return
      }

      updateState({
        uploadProgress: 100,
        uploadStatus: 'completed',
      })
      updateVideoFields(authData, file)
      void cleanupTusLocalStorage(file, authData.videoId)
    },
    [updateState, updateVideoFields],
  )

  const handleAlreadyUploadedVideo = useCallback(
    (authData: TusAuthResponse, file: File) => {
      if (authData.type !== 'uploaded') {
        return
      }

      updateState({
        authData,
        fileName: authData.title,
        isFileNameEditable: false,
        uploadProgress: 100,
        uploadStatus: 'completed',
      })
      updateVideoFields(authData, file)
      void cleanupTusLocalStorage(file, authData.videoId)
    },
    [updateState, updateVideoFields],
  )

  const createTusUpload = useCallback(
    (file: File, authData: TusAuthResponse, isReplacement = false) => {
      if (authData.type !== 'upload') {
        throw new Error('Cannot create upload for already uploaded video')
      }

      const upload = new tus.Upload(file, {
        metadata: {
          filetype: file.type,
          title: state.fileName || file.name,
          videoId: authData.videoId,
          videoToken: authData.videoToken,
        },
        onBeforeRequest: renewTusHeaders({
          auth: authData,
          body: getAuthRequest(file, authData.videoId, authData.videoToken),
          url: tusAuthUrl,
        }),
        onError: (err) => {
          const finished = getFinishedTusUpload(err)
          if (finished) {
            if (isSelected(file)) {
              handleAlreadyUploadedVideo(finished, file)
            }
            return
          }
          if (!isReplacement && isLostTusUpload(err) && isSelected(file)) {
            replaceLostUploadRef.current(authData.videoId, authData.videoToken)
            return
          }
          updateState({
            uploadError: err.message,
            uploadStatus: 'error',
          })
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const percentage = (bytesUploaded / bytesTotal) * 100

          let estimatedTimeRemaining: null | number = null
          if (uploadStartTimeRef.current && bytesUploaded > 0 && bytesUploaded < bytesTotal) {
            if (startingBytesRef.current === 0 && bytesUploaded > 0) {
              startingBytesRef.current = bytesUploaded
            }

            const realBytesUploaded = bytesUploaded - startingBytesRef.current
            const elapsed = (Date.now() - uploadStartTimeRef.current) / 1000

            if (elapsed > 0 && realBytesUploaded > 0) {
              const uploadSpeed = realBytesUploaded / elapsed
              const remainingBytes = bytesTotal - bytesUploaded
              estimatedTimeRemaining = remainingBytes / uploadSpeed
            }
          }

          updateState({ estimatedTimeRemaining, uploadProgress: percentage })
        },
        onShouldRetry: shouldRetryTusRequest,
        onSuccess: () => handleUploadSuccess(authData, file),
        removeFingerprintOnSuccess: true,
        retryDelays: TUS_RETRY_DELAYS,
        uploadUrl: authData.uploadUrl,
      })

      return upload
    },
    [getAuthRequest, handleAlreadyUploadedVideo, handleUploadSuccess, state.fileName, tusAuthUrl, updateState],
  )

  const checkPreviousUploads = useCallback(
    async (file: File) => {
      updateState({
        uploadError: null,
        uploadProgress: 0,
        uploadStatus: 'checking',
      })

      try {
        const previousUploads = await findPreviousTusUploads(file, {
          collection: collectionSlug || '',
          filename: file.name,
          filetype: file.type,
        })
        if (!isSelected(file)) {
          return
        }

        if (previousUploads.length === 0) {
          updateState({
            canRestore: false,
            tusData: null,
            uploadStatus: 'idle',
          })
          return
        }

        const previousUpload = previousUploads[0]
        updateState({ tusData: previousUpload })

        if (!previousUpload.metadata?.videoId) {
          updateState({
            canRestore: false,
            uploadStatus: 'idle',
          })
          return
        }

        updateState({
          canRestore: true,
          existingVideoId: previousUpload.metadata.videoId,
        })

        if (previousUpload.metadata.title) {
          updateState({
            fileName: previousUpload.metadata.title,
            isFileNameEditable: false,
          })
        }

        try {
          const authData = await getAuthData(file, previousUpload.metadata.videoId, previousUpload.metadata.videoToken)
          if (!isSelected(file)) {
            return
          }

          await handleVideoIdMismatch(file, previousUpload.metadata.videoId, authData.videoId)
          if (!isSelected(file)) {
            return
          }

          if (authData.type === 'uploaded') {
            handleAlreadyUploadedVideo(authData, file)
            return
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('Could not fetch existing video data:', err)
          if (!isSelected(file)) {
            return
          }
        }

        updateState({ uploadStatus: 'idle' })
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error checking previous uploads:', err)
        if (!isSelected(file)) {
          return
        }
        updateState({
          uploadError: t('@seshuk/payload-storage-bunny:tusUploadErrorPrevCheckFail'),
          uploadStatus: 'error',
        })
      }
    },
    [getAuthData, collectionSlug, t, updateState, handleAlreadyUploadedVideo, handleVideoIdMismatch],
  )

  const performUpload = useCallback(
    async (existingVideoId?: string, existingVideoToken?: string, isReplacement = false) => {
      const file = state.selectedFile
      if (!file) {
        return
      }

      try {
        updateState({
          isFileNameEditable: false,
          uploadError: null,
          uploadProgress: 0,
          uploadStatus: 'preparing',
        })

        const authData = await getAuthData(file, existingVideoId, existingVideoToken)
        if (!isSelected(file)) {
          return
        }

        if (existingVideoId) {
          await handleVideoIdMismatch(file, existingVideoId, authData.videoId)
          if (!isSelected(file)) {
            return
          }
        }

        if (authData.type === 'uploaded') {
          handleAlreadyUploadedVideo(authData, file)
          return
        }

        updateState({ authData })

        const upload = createTusUpload(file, authData, isReplacement)
        tusUploadRef.current = upload
        uploadStartTimeRef.current = Date.now()
        startingBytesRef.current = 0

        updateState({ uploadStatus: 'uploading' })
        upload.start()
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to start upload:', err)
        if (!isSelected(file)) {
          return
        }
        updateState({
          isFileNameEditable: true,
          uploadError: existingVideoId
            ? t('@seshuk/payload-storage-bunny:tusUploadErrorRestoreUpload')
            : t('@seshuk/payload-storage-bunny:tusUploadErrorInitUpload'),
          uploadStatus: 'error',
        })
      }
    },
    [
      state.selectedFile,
      getAuthData,
      createTusUpload,
      updateState,
      t,
      handleAlreadyUploadedVideo,
      handleVideoIdMismatch,
    ],
  )

  const handleFileSelection = async (files: File | FileList) => {
    const fileToUpload = files instanceof FileList ? files[0] : files
    if (!fileToUpload) {
      return
    }

    if (processedFileRef.current === fileToUpload) {
      return
    }

    const isMimeTypeAllowed = allowedMimeTypes.some((pattern: string) =>
      matchesMimeTypePattern(fileToUpload.type, pattern),
    )

    if (!isMimeTypeAllowed) {
      toast.error(t('@seshuk/payload-storage-bunny:tusUploadErrorFileType'))
      return
    }

    processedFileRef.current = fileToUpload
    selectedFileRef.current = fileToUpload

    if (tusUploadRef.current) {
      void tusUploadRef.current.abort()
      tusUploadRef.current = null
    }

    if (inputRef.current) {
      inputRef.current.value = ''
    }

    resetState()
    updateState({
      fileName: fileToUpload.name,
      selectedFile: fileToUpload,
    })

    await checkPreviousUploads(fileToUpload)
  }

  const handleFileRemoval = () => {
    selectedFileRef.current = null
    if (tusUploadRef.current) {
      void tusUploadRef.current.abort()
      tusUploadRef.current = null
    }

    resetState()
    uploadedVideoFieldsRef.current = null

    if (previousVideoFieldsRef.current) {
      for (const [path, field] of Object.entries(previousVideoFieldsRef.current)) {
        dispatchFields(field ? { type: 'UPDATE_MANY', formState: { [path]: field } } : { type: 'REMOVE', path })
      }
      previousVideoFieldsRef.current = null
    }

    if (isAutoMode) {
      onDisableTus()
    } else {
      onCancel?.()
    }
  }

  const handleFileNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (state.isFileNameEditable) {
      updateState({ fileName: e.target.value })
    }
  }

  useEffect(() => {
    replaceLostUploadRef.current = (videoId, videoToken) => void performUpload(videoId, videoToken, true)
  }, [performUpload])

  useEffect(() => {
    tusDataRef.current = state.tusData
  }, [state.tusData])

  const startNewUpload = () => performUpload()
  const startOver = () => {
    const file = state.selectedFile
    if (!file) {
      return
    }
    if (state.existingVideoId) {
      void cleanupTusLocalStorage(file, state.existingVideoId)
    }
    resetState()
    updateState({ fileName: file.name, selectedFile: file })
  }
  const restoreUpload = () =>
    state.existingVideoId ? performUpload(state.existingVideoId, state.tusData?.metadata?.videoToken) : performUpload()
  const retryUpload = () =>
    state.authData?.type === 'upload'
      ? performUpload(state.authData.videoId, state.authData.videoToken)
      : restoreUpload()

  const pauseUpload = () => {
    if (state.uploadProgress >= 99) {
      return
    }

    if (tusUploadRef.current) {
      void tusUploadRef.current.abort()
      updateState({ uploadStatus: 'paused' })
    }
  }

  const resumeUpload = () => {
    const file = state.selectedFile
    if (!file || !state.authData || state.authData.type !== 'upload') {
      return
    }

    try {
      const upload = createTusUpload(file, state.authData)
      tusUploadRef.current = upload
      uploadStartTimeRef.current = Date.now()
      startingBytesRef.current = 0
      updateState({
        uploadError: null,
        uploadStatus: 'uploading',
      })
      upload.start()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to resume upload:', err)
      updateState({
        uploadError: t('@seshuk/payload-storage-bunny:tusUploadErrorRestoreUpload'),
        uploadStatus: 'error',
      })
    }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      setBackgroundProcessing(false)
      if (tusUploadRef.current) {
        void tusUploadRef.current.abort()
      }
    }
  }, [setBackgroundProcessing])

  useEffect(() => {
    setBackgroundProcessing(!!state.selectedFile)
  }, [state.selectedFile, setBackgroundProcessing])

  useEffect(() => {
    if (!backgroundProcessing && state.selectedFile && state.uploadStatus !== 'completed') {
      setBackgroundProcessing(true)
    }
  }, [backgroundProcessing, state.selectedFile, state.uploadStatus, setBackgroundProcessing])

  const isUploadRunning = state.uploadStatus === 'preparing' || state.uploadStatus === 'uploading'

  useEffect(() => {
    if (!isUploadRunning) {
      return
    }
    const preventLeave = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', preventLeave)
    return () => window.removeEventListener('beforeunload', preventLeave)
  }, [isUploadRunning])

  useEffect(() => {
    if (preSelectedFile && !preSelectedFilesRef.current.has(preSelectedFile)) {
      preSelectedFilesRef.current.add(preSelectedFile)
      void handleFileSelection(preSelectedFile)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedFile])

  useEffect(() => {
    const savedVideoId = (mostRecentUpdate?.doc as undefined | { bunnyData?: { stream?: { videoId?: unknown } } })
      ?.bunnyData?.stream?.videoId
    const isDocumentSavedAfterUpload =
      mostRecentUpdate &&
      mostRecentUpdate.updatedAt !== prevUpdatedAtRef.current &&
      state.uploadStatus === 'completed' &&
      state.authData &&
      savedVideoId === state.authData.videoId

    if (isDocumentSavedAfterUpload) {
      uploadedVideoFieldsRef.current = null
      if (!hasAutosave) {
        setModified(false)
      }
      onDisableTus()
    }

    prevUpdatedAtRef.current = mostRecentUpdate?.updatedAt ?? null
  }, [hasAutosave, mostRecentUpdate, state.uploadStatus, state.authData, onDisableTus, setModified])

  useEffect(() => {
    const uploaded = uploadedVideoFieldsRef.current
    if (uploaded && isUploadReverted) {
      writeVideoFields(uploaded)
      setModified(true)
    }
  }, [isUploadReverted, setModified, writeVideoFields])

  const [previewSrc, setPreviewSrc] = useState<null | string>(null)

  useEffect(() => {
    if (!state.selectedFile) {
      setPreviewSrc(null)
      return
    }

    const src = URL.createObjectURL(state.selectedFile)
    setPreviewSrc(src)

    return () => URL.revokeObjectURL(src)
  }, [state.selectedFile])

  return {
    acceptMimeTypes,
    handleFileNameChange,
    handleFileRemoval,
    handleFileSelection,
    inputRef,
    pauseUpload,
    previewSrc,
    restoreUpload,
    resumeUpload,
    retryUpload,
    startNewUpload,
    startOver,
    state,
  }
}
