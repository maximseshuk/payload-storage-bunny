'use client'

import {
  Button,
  Dropzone,
  ErrorIcon,
  Spinner,
  SuccessIcon,
  TextInput,
  toast,
  useConfig,
  useDocumentEvents,
  useForm,
  useTranslation,
} from '@payloadcms/ui'
import { VideoPreview } from '@payloadcms/ui/elements/FileManager/FilePreview/VideoPreview'
import ky from 'ky'
import { formatFilesize } from 'payload/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as tus from 'tus-js-client'

import { ToggleButton } from '@/client/TusUpload/ToggleButton/ToggleButton.js'
import { BUNNY_API, TUS_MIME_TYPES } from '@/shared/constants.js'
import { matchesMimeTypePattern } from '@/shared/mimeTypes.js'
import type { PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys } from '@/shared/translations/index.js'
import type { StreamTusAuthResponse } from '@/shared/types/index.js'

import { BASE_CLASS, INITIAL_STATE, TUS_RETRY_DELAYS } from './FileManager.constants.js'
import type { UploadState } from './FileManager.types.js'
import './FileManager.css'
import { cleanupTusLocalStorage, findPreviousTusUploads } from './FileManager.utils.js'

type StatusView = {
  actions?: React.ReactNode
  icon?: React.ReactNode
  meta: string
  progress?: number
  text: string
  tone?: 'danger' | 'placeholder' | 'success'
}

type FileManagerProps = {
  collectionSlug: string
  isAutoMode?: boolean
  onDisableTus: () => void
  preSelectedFile?: File | null
}

export const FileManager: React.FC<FileManagerProps> = ({
  collectionSlug,
  isAutoMode = false,
  onDisableTus,
  preSelectedFile,
}) => {
  const [state, setState] = useState<UploadState>(INITIAL_STATE)
  const inputRef = useRef<HTMLInputElement>(null)
  const tusUploadRef = useRef<null | tus.Upload>(null)
  const processedFileRef = useRef<File | null>(null)
  const uploadStartTimeRef = useRef<null | number>(null)
  const startingBytesRef = useRef<number>(0)
  const prevUpdatedAtRef = useRef<null | string>(null)

  const { dispatchFields, setBackgroundProcessing } = useForm()
  const { t } = useTranslation<PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys>()
  const { mostRecentUpdate } = useDocumentEvents()
  const {
    config: {
      routes: { api },
      serverURL,
    },
    getEntityConfig,
  } = useConfig()

  const allowedMimeTypes = useMemo(() => {
    const collectionConfig = getEntityConfig({ collectionSlug })
    return collectionConfig?.admin?.custom?.['@seshuk/payload-storage-bunny']?.stream?.mimeTypes ?? TUS_MIME_TYPES
  }, [collectionSlug, getEntityConfig])

  const acceptMimeTypes = allowedMimeTypes.join(', ')

  const updateState = useCallback((updates: Partial<UploadState>) => {
    setState((prev) => ({ ...prev, ...updates }))
  }, [])

  const resetState = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  const updateVideoFields = useCallback(
    ({ videoId, videoToken }: StreamTusAuthResponse, file: File) => {
      const fields = [
        { path: 'bunnyData.stream.videoId', value: videoId },
        { path: 'bunnyData.stream.videoToken', value: videoToken },
        { path: 'mimeType', value: state.tusData?.metadata?.filetype || file.type },
        { path: 'filesize', value: state.tusData?.size || file.size },
        { path: 'filename', value: state.tusData?.metadata?.title || file.name },
        { path: 'focalX', value: null },
        { path: 'focalY', value: null },
        { path: 'width', value: null },
        { path: 'height', value: null },
      ]

      fields.forEach(({ path, value }) => {
        dispatchFields({ type: 'UPDATE', path, value })
      })
    },
    [dispatchFields, state.tusData],
  )

  const getAuthData = useCallback(
    async (file: File, existingVideoId?: string, existingVideoToken?: string): Promise<StreamTusAuthResponse> => {
      const filesize = state.tusData?.size || file.size

      const response = await ky
        .post(`${serverURL}${api}/storage-bunny/stream/tus-auth`, {
          json: {
            collection: collectionSlug,
            filename: file.name,
            filesize,
            filetype: file.type,
            title: state.fileName,
            videoId: existingVideoId,
            videoToken: existingVideoToken,
          },
        })
        .json<StreamTusAuthResponse>()

      return response
    },
    [api, collectionSlug, serverURL, state.fileName, state.tusData],
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
    (authData: StreamTusAuthResponse, file: File, upload: tus.Upload) => {
      updateState({
        uploadProgress: 100,
        uploadStatus: 'completed',
      })
      setBackgroundProcessing(false)

      upload
        .findPreviousUploads()
        // eslint-disable-next-line promise/always-return
        .then((currentUploads) => {
          if (currentUploads.length > 0) {
            updateState({ tusData: currentUploads[0] })
          }
          updateVideoFields(authData, file)
          void cleanupTusLocalStorage(file, authData.videoId)
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Error getting upload data:', err)
          updateVideoFields(authData, file)
          void cleanupTusLocalStorage(file, authData.videoId)
        })
    },
    [setBackgroundProcessing, updateState, updateVideoFields],
  )

  const createTusUpload = useCallback(
    (file: File, authData: StreamTusAuthResponse) => {
      if (authData.type !== 'upload') {
        throw new Error('Cannot create upload for already uploaded video')
      }

      const upload = new tus.Upload(file, {
        endpoint: BUNNY_API.TUS_ENDPOINT,
        headers: {
          AuthorizationExpire: authData.authorizationExpire.toString(),
          AuthorizationSignature: authData.authorizationSignature,
          LibraryId: authData.libraryId.toString(),
          VideoId: authData.videoId,
        },
        metadata: {
          filetype: file.type,
          title: state.fileName || file.name,
          videoId: authData.videoId,
          videoToken: authData.videoToken,
          ...(typeof authData.thumbnailTime === 'number' && { thumbnailTime: authData.thumbnailTime.toString() }),
        },
        onError: (err) => {
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
              const remainingBytes = bytesTotal - realBytesUploaded
              estimatedTimeRemaining = remainingBytes / uploadSpeed
            }
          }

          updateState({ estimatedTimeRemaining, uploadProgress: percentage })
        },
        onSuccess: () => handleUploadSuccess(authData, file, upload),
        removeFingerprintOnSuccess: true,
        retryDelays: TUS_RETRY_DELAYS,
      })

      return upload
    },
    [state.fileName, updateState, handleUploadSuccess],
  )

  const handleAlreadyUploadedVideo = useCallback(
    (authData: StreamTusAuthResponse, file: File) => {
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
      setBackgroundProcessing(false)
      updateVideoFields(authData, file)
      void cleanupTusLocalStorage(file, authData.videoId)
    },
    [setBackgroundProcessing, updateState, updateVideoFields],
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

          await handleVideoIdMismatch(file, previousUpload.metadata.videoId, authData.videoId)

          if (authData.type === 'uploaded') {
            handleAlreadyUploadedVideo(authData, file)
            return
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('Could not fetch existing video data:', err)
        }

        updateState({ uploadStatus: 'idle' })
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error checking previous uploads:', err)
        updateState({
          uploadError: t('@seshuk/payload-storage-bunny:tusUploadErrorPrevCheckFail'),
          uploadStatus: 'error',
        })
      }
    },
    [getAuthData, collectionSlug, t, updateState, handleAlreadyUploadedVideo, handleVideoIdMismatch],
  )

  const performUpload = useCallback(
    async (existingVideoId?: string) => {
      if (!state.selectedFile) {
        return
      }

      try {
        updateState({
          isFileNameEditable: false,
          uploadError: null,
          uploadProgress: 0,
          uploadStatus: 'preparing',
        })

        const authData = await getAuthData(
          state.selectedFile,
          existingVideoId,
          existingVideoId ? state.tusData?.metadata?.videoToken : undefined,
        )

        if (existingVideoId) {
          await handleVideoIdMismatch(state.selectedFile, existingVideoId, authData.videoId)
        }

        if (authData.type === 'uploaded') {
          handleAlreadyUploadedVideo(authData, state.selectedFile)
          return
        }

        updateState({ authData })

        const upload = createTusUpload(state.selectedFile, authData)
        tusUploadRef.current = upload
        uploadStartTimeRef.current = Date.now()
        startingBytesRef.current = 0

        if (existingVideoId && authData.videoId === existingVideoId) {
          const previousUploads = await upload.findPreviousUploads()
          if (previousUploads.length > 0) {
            upload.resumeFromPreviousUpload(previousUploads[0])
          }
        }

        updateState({ uploadStatus: 'uploading' })
        upload.start()
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to start upload:', err)
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
      state.tusData,
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

    if (inputRef.current) {
      inputRef.current.value = ''
    }

    resetState()
    updateState({
      fileName: fileToUpload.name,
      selectedFile: fileToUpload,
    })

    dispatchFields({ type: 'UPDATE', path: 'mimeType', value: fileToUpload.type })

    await checkPreviousUploads(fileToUpload)
  }

  const handleFileRemoval = () => {
    if (tusUploadRef.current) {
      void tusUploadRef.current.abort()
      tusUploadRef.current = null
    }

    resetState()

    dispatchFields({ type: 'UPDATE', path: 'mimeType', value: null })

    if (isAutoMode) {
      onDisableTus()
    }
  }

  const handleFileNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (state.isFileNameEditable) {
      updateState({ fileName: e.target.value })
    }
  }

  const startNewUpload = () => performUpload()
  const restoreUpload = () => performUpload(state.existingVideoId || undefined)

  const pauseUpload = () => {
    if (state.uploadProgress >= 99) {
      return
    }

    if (tusUploadRef.current) {
      void tusUploadRef.current.abort()
      updateState({ uploadStatus: 'paused' })
    }
  }

  const resumeUpload = async () => {
    if (!state.selectedFile || !state.authData || state.authData.type !== 'upload') {
      return
    }

    try {
      const upload = createTusUpload(state.selectedFile, state.authData)
      tusUploadRef.current = upload
      uploadStartTimeRef.current = Date.now()
      startingBytesRef.current = 0
      updateState({
        uploadError: null,
        uploadStatus: 'uploading',
      })

      const previousUploads = await upload.findPreviousUploads()
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0])
      }

      upload.start()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to resume upload:', err)
      updateState({
        uploadError: 'Failed to resume upload',
        uploadStatus: 'error',
      })
    }
  }

  useEffect(() => {
    return () => {
      if (tusUploadRef.current) {
        void tusUploadRef.current.abort()
      }
    }
  }, [])

  useEffect(() => {
    setBackgroundProcessing(!!state.selectedFile)
  }, [state.selectedFile, setBackgroundProcessing])

  useEffect(() => {
    if (preSelectedFile && processedFileRef.current !== preSelectedFile) {
      processedFileRef.current = preSelectedFile

      updateState({
        fileName: preSelectedFile.name,
        selectedFile: preSelectedFile,
      })

      void checkPreviousUploads(preSelectedFile)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedFile])

  useEffect(() => {
    const isDocumentSavedAfterUpload =
      mostRecentUpdate &&
      mostRecentUpdate.updatedAt !== prevUpdatedAtRef.current &&
      state.uploadStatus === 'completed' &&
      state.authData

    if (isDocumentSavedAfterUpload) {
      onDisableTus()
    }

    prevUpdatedAtRef.current = mostRecentUpdate?.updatedAt ?? null
  }, [mostRecentUpdate, state.uploadStatus, state.authData, onDisableTus])

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

  const formatTimeRemaining = (seconds: number): string => {
    const s = t('@seshuk/payload-storage-bunny:tusUploadTimeSeconds')
    const m = t('@seshuk/payload-storage-bunny:tusUploadTimeMinutes')
    const h = t('@seshuk/payload-storage-bunny:tusUploadTimeHours')

    if (seconds < 60) {
      return `${Math.ceil(seconds)}${s}`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.ceil(seconds % 60)
    if (minutes < 60) {
      return remainingSeconds > 0 ? `${minutes}${m} ${remainingSeconds}${s}` : `${minutes}${m}`
    }
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return remainingMinutes > 0 ? `${hours}${h} ${remainingMinutes}${m}` : `${hours}${h}`
  }

  const renderStatus = (file: File): StatusView => {
    const { canRestore, estimatedTimeRemaining, uploadError, uploadProgress, uploadStatus } = state
    const progress = Math.floor(uploadProgress)
    const hint = t('@seshuk/payload-storage-bunny:tusUploadHint')
    const transferred = t('@seshuk/payload-storage-bunny:tusUploadProgress', {
      total: formatFilesize(file.size),
      uploaded: formatFilesize(Math.round((file.size * uploadProgress) / 100)),
    })

    switch (uploadStatus) {
      case 'checking':
        return {
          icon: <Spinner loadingText={null} size="sm" />,
          meta: hint,
          text: t('@seshuk/payload-storage-bunny:tusUploadStatusChecking'),
          tone: 'placeholder',
        }
      case 'completed':
        return {
          icon: <SuccessIcon />,
          meta: t('@seshuk/payload-storage-bunny:tusUploadSaveToFinish'),
          progress: 100,
          text: t('@seshuk/payload-storage-bunny:tusUploadStatusCompleted'),
          tone: 'success',
        }
      case 'error':
        return {
          actions: (
            <Button buttonStyle="primary" margin={false} onClick={startNewUpload}>
              {t('@seshuk/payload-storage-bunny:tusUploadRetry')}
            </Button>
          ),
          icon: <ErrorIcon />,
          meta: uploadError ?? hint,
          progress: progress > 0 ? progress : undefined,
          text:
            progress > 0
              ? t('@seshuk/payload-storage-bunny:tusUploadStatusFailedAt', { progress })
              : t('@seshuk/payload-storage-bunny:tusUploadStatusFailed'),
          tone: 'danger',
        }
      case 'idle':
        return canRestore
          ? {
              actions: (
                <>
                  <Button buttonStyle="ghost" margin={false} onClick={startNewUpload}>
                    {t('@seshuk/payload-storage-bunny:tusUploadStartOver')}
                  </Button>
                  <Button buttonStyle="primary" margin={false} onClick={restoreUpload}>
                    {t('@seshuk/payload-storage-bunny:tusUploadResume')}
                  </Button>
                </>
              ),
              meta: t('@seshuk/payload-storage-bunny:tusUploadResumeHint'),
              text: t('@seshuk/payload-storage-bunny:tusUploadStatusIdleWithRestore'),
              tone: 'placeholder',
            }
          : {
              actions: (
                <Button buttonStyle="primary" margin={false} onClick={startNewUpload}>
                  {t('@seshuk/payload-storage-bunny:tusUploadStartUpload')}
                </Button>
              ),
              meta: hint,
              text: t('@seshuk/payload-storage-bunny:tusUploadStatusIdle'),
              tone: 'placeholder',
            }
      case 'paused':
        return {
          actions: (
            <Button buttonStyle="primary" margin={false} onClick={resumeUpload}>
              {t('@seshuk/payload-storage-bunny:tusUploadResume')}
            </Button>
          ),
          meta: transferred,
          progress,
          text: t('@seshuk/payload-storage-bunny:tusUploadStatusPaused', { progress }),
        }
      case 'preparing':
        return {
          icon: <Spinner loadingText={null} size="sm" />,
          meta: hint,
          text: t('@seshuk/payload-storage-bunny:tusUploadPreparing'),
          tone: 'placeholder',
        }
      case 'uploading':
        return uploadProgress >= 99
          ? {
              icon: <Spinner loadingText={null} size="sm" />,
              meta: transferred,
              progress,
              text: t('@seshuk/payload-storage-bunny:tusUploadStatusFinalizing'),
            }
          : {
              actions: (
                <Button buttonStyle="secondary" margin={false} onClick={pauseUpload}>
                  {t('@seshuk/payload-storage-bunny:tusUploadPause')}
                </Button>
              ),
              meta: estimatedTimeRemaining
                ? `${transferred} · ${t('@seshuk/payload-storage-bunny:tusUploadTimeLeft', {
                    time: formatTimeRemaining(estimatedTimeRemaining),
                  })}`
                : transferred,
              progress,
              text: t('@seshuk/payload-storage-bunny:tusUploadStatusUploading', { progress }),
            }
    }
  }

  const renderStatusField = (file: File) => {
    const { actions, icon, meta, progress, text, tone } = renderStatus(file)

    return (
      <div className={`${BASE_CLASS}__status-field`}>
        <div
          aria-label={text}
          aria-valuemax={progress === undefined ? undefined : 100}
          aria-valuemin={progress === undefined ? undefined : 0}
          aria-valuenow={progress}
          className={`${BASE_CLASS}__status-box${tone === 'danger' ? ` ${BASE_CLASS}__status-box--danger` : ''}`}
          role={progress === undefined ? 'group' : 'progressbar'}
        >
          {progress !== undefined && (
            <div
              className={`${BASE_CLASS}__status-fill${tone === 'danger' || tone === 'success' ? ` ${BASE_CLASS}__status-fill--${tone}` : ''}`}
              style={{ width: `${progress}%` }}
            />
          )}
          <output className={`${BASE_CLASS}__status${tone ? ` ${BASE_CLASS}__status--${tone}` : ''}`}>
            {icon}
            {text}
          </output>
          {actions && <div className={`${BASE_CLASS}__actions`}>{actions}</div>}
        </div>
        <span className={`${BASE_CLASS}__meta${tone === 'danger' ? ` ${BASE_CLASS}__meta--danger` : ''}`}>{meta}</span>
      </div>
    )
  }

  return (
    <div className={`field-type file-manager ${BASE_CLASS} ${BASE_CLASS}--${state.uploadStatus}`}>
      <div className="file-manager__panel">
        <div className="file-manager__content">
          <div className="file-manager__upload">
            {!state.selectedFile && (
              <Dropzone onChange={handleFileSelection}>
                <div className="upload-dropzone-content">
                  <div className={`upload-dropzone-content__buttons ${BASE_CLASS}__dropzoneButtons`}>
                    <Button buttonStyle="secondary" onClick={() => inputRef.current?.click()} size="medium">
                      {t('upload:selectFile')}
                    </Button>
                    <input
                      accept={acceptMimeTypes}
                      hidden
                      onChange={(e) => {
                        if (e.target.files?.length) {
                          void handleFileSelection(e.target.files)
                        }
                      }}
                      ref={inputRef}
                      type="file"
                    />
                    <ToggleButton isEnabled={true} onToggle={onDisableTus} />
                  </div>
                  <p className="upload-dropzone-content__drag-text">
                    {t('general:or')} {t('upload:dragAndDrop')}
                  </p>
                </div>
              </Dropzone>
            )}

            {state.selectedFile && (
              <>
                <Button
                  buttonStyle="secondary"
                  className={`file-manager__remove ${BASE_CLASS}__remove`}
                  icon="x"
                  onClick={handleFileRemoval}
                  round
                  tooltip={t('general:cancel')}
                />
                {previewSrc && (
                  <div className="file-manager__selected-preview">
                    <VideoPreview fileSrc={previewSrc} />
                  </div>
                )}
                <div className="file-manager__file-adjustments">
                  <TextInput
                    id={`field-${BASE_CLASS}-filename`}
                    label={t('upload:fileName')}
                    onChange={handleFileNameChange}
                    path="filename"
                    readOnly={!state.isFileNameEditable}
                    value={state.fileName}
                  />
                  <span className="file-manager__selected-meta">
                    {[formatFilesize(state.selectedFile.size), state.selectedFile.type].filter(Boolean).join(' – ')}
                  </span>
                  {renderStatusField(state.selectedFile)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
