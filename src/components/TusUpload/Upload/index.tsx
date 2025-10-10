'use client'

import type { PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys } from '@/translations/index.js'
import type { StreamTusAuthResponse } from '@/types/index.js'

import { TUS_MIME_TYPES } from '@/utils/constants.js'
import { matchesMimeTypePattern } from '@/utils/mimeTypes.js'
import { Button, Dropzone, useConfig, useDocumentEvents, useForm, useTranslation } from '@payloadcms/ui'
import ky from 'ky'
import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as tus from 'tus-js-client'

import './index.scss'
import { ToggleControl } from '../ToggleButton/index.js'

const baseClass = 'storage-bunny-tus-upload'
const TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload'
const RETRY_DELAYS = [0, 3000, 5000, 10000, 20000, 60000, 60000]

type UploadStatus = 'checking' | 'completed' | 'error' | 'idle' | 'paused' | 'preparing' | 'uploading'

type UploadProps = {
  collectionSlug: string
  isAutoMode?: boolean
  onDisableTus: () => void
  preSelectedFile?: File | null
}

type UploadState = {
  canRestore: boolean
  existingVideoId: null | string
  fileName: string
  isFileNameEditable: boolean
  selectedFile: File | null
  tusData: null | tus.PreviousUpload
  uploadError: null | string
  uploadProgress: number
  uploadStatus: UploadStatus
  videoAuthData: null | StreamTusAuthResponse
}

const initialState: UploadState = {
  canRestore: false,
  existingVideoId: null,
  fileName: '',
  isFileNameEditable: true,
  selectedFile: null,
  tusData: null,
  uploadError: null,
  uploadProgress: 0,
  uploadStatus: 'idle',
  videoAuthData: null,
}

export const Upload: React.FC<UploadProps> = ({
  collectionSlug,
  isAutoMode = false,
  onDisableTus,
  preSelectedFile,
}) => {
  const [state, setState] = useState<UploadState>(initialState)
  const inputRef = useRef<HTMLInputElement>(null)
  const tusUploadRef = useRef<null | tus.Upload>(null)
  const prevUpdateRef = useRef<null | string>(null)
  const processedFileRef = useRef<File | null>(null)

  const { dispatchFields, setBackgroundProcessing } = useForm()
  const { t } = useTranslation<PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys>()
  const { getEntityConfig } = useConfig()
  const { mostRecentUpdate } = useDocumentEvents()

  const allowedMimeTypes = useMemo(() => {
    const collectionConfig = getEntityConfig({ collectionSlug })
    return collectionConfig?.admin?.custom?.['@seshuk/payload-storage-bunny']?.stream?.mimeTypes ?? TUS_MIME_TYPES
  }, [collectionSlug, getEntityConfig])

  const acceptMimeTypes = allowedMimeTypes.join(', ')

  const updateState = useCallback((updates: Partial<UploadState>) => {
    setState((prev) => ({ ...prev, ...updates }))
  }, [])

  const resetState = useCallback(() => {
    setState(initialState)
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

  const cleanupTusLocalStorage = useCallback(async (file: File, videoId: string) => {
    try {
      const tempUpload = new tus.Upload(file, {
        endpoint: TUS_ENDPOINT,
        metadata: { videoId },
      })

      const { options } = tempUpload
      const { fingerprint, urlStorage } = options

      if (!fingerprint || !urlStorage) {
        // eslint-disable-next-line no-console
        console.warn('No fingerprint or urlStorage available')
        return
      }

      const fp = await fingerprint(file, options)
      const uploads = fp ? await urlStorage.findUploadsByFingerprint(fp) : []

      const uploadsToRemove = uploads.filter((u) => u.metadata?.videoId === videoId)

      await Promise.all(
        uploadsToRemove.map((u) => (u.urlStorageKey ? urlStorage.removeUpload(u.urlStorageKey) : Promise.resolve())),
      )
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Failed to clean up tus localStorage entries:', err)
    }
  }, [])

  const getAuthData = useCallback(
    async (file: File, existingVideoId?: string): Promise<StreamTusAuthResponse> => {
      const filesize = state.tusData?.size || file.size

      const response = await ky
        .post('/api/storage-bunny/stream/tus-auth', {
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
    [collectionSlug, state.fileName, state.tusData],
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
    [cleanupTusLocalStorage, updateState],
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
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Error getting upload data:', err)
          updateVideoFields(authData.videoId, file)
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
          updateState({ uploadProgress: percentage })
        },
        onSuccess: () => handleUploadSuccess(authData, file, upload),
        retryDelays: RETRY_DELAYS,
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
        fileName: authData.title,
        isFileNameEditable: false,
        uploadProgress: 100,
        uploadStatus: 'completed',
        videoAuthData: authData,
      })
      setBackgroundProcessing(false)
      updateVideoFields(authData.videoId, file)
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
        const tempUpload = new tus.Upload(file, {
          endpoint: TUS_ENDPOINT,
          metadata: {
            collection: collectionSlug || '',
            filename: file.name,
            filetype: file.type,
          },
        })

        const previousUploads = await tempUpload.findPreviousUploads()

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

        updateState({ videoAuthData: authData })

        const upload = createTusUpload(state.selectedFile, authData)
        tusUploadRef.current = upload

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
    if (!state.selectedFile || !state.videoAuthData || state.videoAuthData.type !== 'upload') {
      return
    }

    try {
      const upload = createTusUpload(state.selectedFile, state.videoAuthData)
      tusUploadRef.current = upload
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
    const shouldCleanup =
      mostRecentUpdate &&
      mostRecentUpdate !== prevUpdateRef.current &&
      state.uploadStatus === 'completed' &&
      state.selectedFile &&
      state.videoAuthData

    if (shouldCleanup) {
      void cleanupTusLocalStorage(state.selectedFile!, state.videoAuthData!.videoId).then(() => {
        onDisableTus()
      })
    }

    prevUpdateRef.current = mostRecentUpdate
  }, [
    mostRecentUpdate,
    state.uploadStatus,
    state.selectedFile,
    state.videoAuthData,
    onDisableTus,
    cleanupTusLocalStorage,
  ])

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

  const renderProgressText = () => {
    const { canRestore, uploadError, uploadProgress, uploadStatus } = state

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
          : t('@seshuk/payload-storage-bunny:tusUploadStatusUploading', {
            progress: uploadProgress.toFixed(1),
          }),
    }

    return statusTextMap[uploadStatus as keyof typeof statusTextMap] || null
  }

  return (
    <div className={`${baseClass} ${baseClass}--${state.uploadStatus}`}>
      <div className={`${baseClass}__upload`}>
        {!state.selectedFile && (
          <Dropzone onChange={handleFileSelection}>
            <div className={`${baseClass}__dropzoneContent`}>
              <div className={`${baseClass}__dropzoneButtons`}>
                <Button buttonStyle="pill" onClick={() => inputRef.current?.click()} size="small">
                  {t('upload:selectFile')}
                </Button>
                <input
                  accept={acceptMimeTypes}
                  aria-hidden="true"
                  className={`${baseClass}__hidden-input`}
                  hidden
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      void handleFileSelection(e.target.files)
                    }
                  }}
                  ref={inputRef}
                  type="file"
                />
                <ToggleControl isEnabled={true} onToggle={onDisableTus} />
              </div>
              <p className={`${baseClass}__dragAndDropText`}>
                {t('general:or')} {t('upload:dragAndDrop')}
              </p>
            </div>
          </Dropzone>
        )}

        {state.selectedFile && (
          <Fragment>
            <div className={`${baseClass}__file-container`}>
              <div className={`${baseClass}__filename-section`}>
                {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
                <input
                  className={`${baseClass}__filename`}
                  disabled={!state.isFileNameEditable}
                  onChange={handleFileNameChange}
                  title={state.fileName}
                  type="text"
                  value={state.fileName}
                />
                <Button
                  buttonStyle="icon-label"
                  className={`${baseClass}__remove`}
                  icon="x"
                  iconStyle="with-border"
                  onClick={handleFileRemoval}
                  round
                  tooltip={t('general:cancel')}
                />
              </div>

              <div className={`${baseClass}__file-header`}>
                <div className={`${baseClass}__tus-controls`}>{renderUploadControls()}</div>

                <span className={`${baseClass}__file-size`}>
                  {t('@seshuk/payload-storage-bunny:tusUploadFileSize', {
                    size: (state.selectedFile.size / 1024 / 1024).toFixed(2),
                  })}
                </span>
              </div>
              <div
                className={`${baseClass}__progress-bar ${baseClass}__progress-bar--${state.uploadStatus}`}
                style={{ '--upload-progress': `${state.uploadProgress}%` } as React.CSSProperties}
              >
                <div className={`${baseClass}__progress-fill`}></div>
                <div className={`${baseClass}__progress-text`}>{renderProgressText()}</div>
              </div>
            </div>
          </Fragment>
        )}
      </div>
    </div>
  )
}
