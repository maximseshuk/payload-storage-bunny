'use client'

import type { PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys } from '@/translations/index.js'
import type { StreamTusAuthResponse } from '@/types/index.js'

import { TUS_MIME_TYPES } from '@/utils/constants.js'
import { matchesMimeTypePattern } from '@/utils/mimeTypes.js'
import { Button, Dropzone, useConfig, useDocumentEvents, useForm, useTranslation } from '@payloadcms/ui'
import ky from 'ky'
import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as tus from 'tus-js-client'

import type { UploadState } from './Upload.types.js'

import { ToggleButton } from '../ToggleButton/ToggleButton.js'
import { BASE_CLASS, INITIAL_STATE, TUS_ENDPOINT, TUS_RETRY_DELAYS } from './Upload.constants.js'
import { cleanupTusLocalStorage, findPreviousTusUploads } from './Upload.utils.js'
import './Upload.scss'

type UploadProps = {
  collectionSlug: string
  isAutoMode?: boolean
  onDisableTus: () => void
  preSelectedFile?: File | null
}

export const Upload: React.FC<UploadProps> = ({
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
  const prevUpdateRef = useRef<number | undefined>(undefined)

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
    (videoId: string, file: File) => {
      const fields = [
        { path: 'bunnyVideoId', value: videoId },
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
    async (file: File, existingVideoId?: string): Promise<StreamTusAuthResponse> => {
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
        .then((currentUploads) => {
          if (currentUploads.length > 0) {
            updateState({ tusData: currentUploads[0] })
          }
          updateVideoFields(authData.videoId, file)
          void cleanupTusLocalStorage(file, authData.videoId)
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Error getting upload data:', err)
          updateVideoFields(authData.videoId, file)
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
        endpoint: TUS_ENDPOINT,
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
      updateVideoFields(authData.videoId, file)
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
          const authData = await getAuthData(file, previousUpload.metadata.videoId)

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

        const authData = await getAuthData(state.selectedFile, existingVideoId)

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
      updateState({ uploadError: t('@seshuk/payload-storage-bunny:tusUploadErrorFileType') })
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
      mostRecentUpdate !== prevUpdateRef.current &&
      state.uploadStatus === 'completed' &&
      state.authData

    if (isDocumentSavedAfterUpload) {
      onDisableTus()
    }

    prevUpdateRef.current = mostRecentUpdate
  }, [mostRecentUpdate, state.uploadStatus, state.authData, onDisableTus])

  const renderUploadControls = () => {
    const { canRestore, uploadProgress, uploadStatus } = state

    if (canRestore && uploadStatus === 'idle') {
      return (
        <>
          <Button buttonStyle="pill" margin={false} onClick={restoreUpload} size="small">
            {t('@seshuk/payload-storage-bunny:tusUploadResume')}
          </Button>
          <Button buttonStyle="pill" margin={false} onClick={startNewUpload} size="small">
            {t('@seshuk/payload-storage-bunny:tusUploadStartOver')}
          </Button>
        </>
      )
    }

    const statusButtonMap = {
      checking: (
        <Button buttonStyle="pill" disabled margin={false} size="small">
          {t('@seshuk/payload-storage-bunny:tusUploadChecking')}
        </Button>
      ),
      error: (
        <Button buttonStyle="pill" margin={false} onClick={startNewUpload} size="small">
          {t('@seshuk/payload-storage-bunny:tusUploadRetry')}
        </Button>
      ),
      idle: !canRestore && (
        <Button buttonStyle="pill" margin={false} onClick={startNewUpload} size="small">
          {t('@seshuk/payload-storage-bunny:tusUploadStartUpload')}
        </Button>
      ),
      paused: (
        <Button buttonStyle="pill" margin={false} onClick={resumeUpload} size="small">
          {t('@seshuk/payload-storage-bunny:tusUploadResume')}
        </Button>
      ),
      preparing: (
        <Button buttonStyle="pill" disabled margin={false} size="small">
          {t('@seshuk/payload-storage-bunny:tusUploadPreparing')}
        </Button>
      ),
      uploading: (
        <Button buttonStyle="pill" disabled={uploadProgress >= 99} margin={false} onClick={pauseUpload} size="small">
          {uploadProgress >= 99
            ? t('@seshuk/payload-storage-bunny:tusUploadFinalizing')
            : t('@seshuk/payload-storage-bunny:tusUploadPause')}
        </Button>
      ),
    }

    return statusButtonMap[uploadStatus as keyof typeof statusButtonMap] || null
  }

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

  const renderProgressText = () => {
    const { canRestore, estimatedTimeRemaining, uploadError, uploadProgress, uploadStatus } = state

    if (uploadError) {
      return uploadError
    }

    const statusTextMap = {
      checking: t('@seshuk/payload-storage-bunny:tusUploadStatusChecking'),
      completed: t('@seshuk/payload-storage-bunny:tusUploadStatusCompleted'),
      idle: canRestore
        ? t('@seshuk/payload-storage-bunny:tusUploadStatusIdleWithRestore')
        : t('@seshuk/payload-storage-bunny:tusUploadStatusIdle'),
      paused: t('@seshuk/payload-storage-bunny:tusUploadStatusPaused', {
        progress: uploadProgress.toFixed(1),
      }),
      preparing: t('@seshuk/payload-storage-bunny:tusUploadPreparing'),
      uploading:
        uploadProgress >= 99
          ? t('@seshuk/payload-storage-bunny:tusUploadStatusFinalizing')
          : (() => {
            const baseText = t('@seshuk/payload-storage-bunny:tusUploadStatusUploading', {
              progress: uploadProgress.toFixed(1),
            })
            return `${baseText}${estimatedTimeRemaining ? ` (~${formatTimeRemaining(estimatedTimeRemaining)})` : ''}`
          })(),
    }

    return statusTextMap[uploadStatus as keyof typeof statusTextMap] || null
  }

  return (
    <div className={`${BASE_CLASS} ${BASE_CLASS}--${state.uploadStatus}`}>
      <div className={`${BASE_CLASS}__upload`}>
        {!state.selectedFile && (
          <Dropzone onChange={handleFileSelection}>
            <div className={`${BASE_CLASS}__dropzoneContent`}>
              <div className={`${BASE_CLASS}__dropzoneButtons`}>
                <Button buttonStyle="pill" onClick={() => inputRef.current?.click()} size="small">
                  {t('upload:selectFile')}
                </Button>
                <input
                  accept={acceptMimeTypes}
                  aria-hidden="true"
                  className={`${BASE_CLASS}__hidden-input`}
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
              <p className={`${BASE_CLASS}__dragAndDropText`}>
                {t('general:or')} {t('upload:dragAndDrop')}
              </p>
            </div>
          </Dropzone>
        )}

        {state.selectedFile && (
          <Fragment>
            <div className={`${BASE_CLASS}__file-container`}>
              <div className={`${BASE_CLASS}__filename-section`}>
                {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
                <input
                  className={`${BASE_CLASS}__filename`}
                  disabled={!state.isFileNameEditable}
                  onChange={handleFileNameChange}
                  title={state.fileName}
                  type="text"
                  value={state.fileName}
                />
                <Button
                  buttonStyle="icon-label"
                  className={`${BASE_CLASS}__remove`}
                  icon="x"
                  iconStyle="with-border"
                  onClick={handleFileRemoval}
                  round
                  tooltip={t('general:cancel')}
                />
              </div>

              <div className={`${BASE_CLASS}__file-header`}>
                <div className={`${BASE_CLASS}__tus-controls`}>{renderUploadControls()}</div>

                <span className={`${BASE_CLASS}__file-size`}>
                  {t('@seshuk/payload-storage-bunny:tusUploadFileSize', {
                    size: (state.selectedFile.size / 1024 / 1024).toFixed(2),
                  })}
                </span>
              </div>
              <div
                className={`${BASE_CLASS}__progress-bar ${BASE_CLASS}__progress-bar--${state.uploadStatus}`}
                style={{ '--upload-progress': `${state.uploadProgress}%` } as React.CSSProperties}
              >
                <div className={`${BASE_CLASS}__progress-fill`}></div>
                <div className={`${BASE_CLASS}__progress-text`}>{renderProgressText()}</div>
              </div>
            </div>
          </Fragment>
        )}
      </div>
    </div>
  )
}
