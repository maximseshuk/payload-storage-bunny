'use client'

import { Button, Dropzone, ErrorIcon, Spinner, SuccessIcon, TextInput, useTranslation } from '@payloadcms/ui'
import { VideoPreview } from '@payloadcms/ui/elements/FileManager/FilePreview/VideoPreview'
import { formatFilesize } from 'payload/shared'

import { ToggleButton } from '@/client/TusUpload/ToggleButton/ToggleButton.js'
import type { PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys } from '@/shared/translations/index.js'

import { BASE_CLASS } from './FileManager.constants.js'
import type { FileManagerProps } from './FileManager.types.js'
import './FileManager.css'
import { useTusUpload } from './useTusUpload.js'

type StatusView = {
  actions?: React.ReactNode
  icon?: React.ReactNode
  meta: string
  progress?: number
  text: string
  tone?: 'danger' | 'placeholder' | 'success'
}

export const FileManager: React.FC<FileManagerProps> = (props) => {
  const { onDisableTus, UploadControls } = props
  const {
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
  } = useTusUpload(props)
  const { t } = useTranslation<PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys>()

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
            <Button buttonStyle="primary" margin={false} onClick={retryUpload}>
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
                  <Button buttonStyle="ghost" margin={false} onClick={startOver}>
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
        <div className={`${BASE_CLASS}__status-box${tone === 'danger' ? ` ${BASE_CLASS}__status-box--danger` : ''}`}>
          {progress !== undefined && (
            <>
              <progress aria-label={text} className="sr-only" max={100} value={progress} />
              <div
                className={`${BASE_CLASS}__status-fill${tone === 'danger' || tone === 'success' ? ` ${BASE_CLASS}__status-fill--${tone}` : ''}`}
                style={{ width: `${progress}%` }}
              />
            </>
          )}
          <span className={`${BASE_CLASS}__status${tone ? ` ${BASE_CLASS}__status--${tone}` : ''}`}>
            {icon}
            {state.uploadStatus === 'uploading' && text}
            <output>{state.uploadStatus !== 'uploading' && text}</output>
          </span>
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
                    {UploadControls}
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
                  aria-label={t('general:cancel')}
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
