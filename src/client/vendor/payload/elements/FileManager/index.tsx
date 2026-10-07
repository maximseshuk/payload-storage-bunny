'use client'
import {
  Button,
  Drawer,
  Dropzone,
  EditDepthProvider,
  EditUpload,
  FieldError,
  fieldBaseClass,
  PreviewSizes,
  TextInput,
  Thumbnail,
  toast,
  useDocumentInfo,
  useField,
  useForm,
  useModal,
  useTranslation,
  useUploadControls,
  useUploadEdits,
} from '@payloadcms/ui'
import { AudioPreview } from '@payloadcms/ui/elements/FileManager/FilePreview/AudioPreview'
import { PdfPreview } from '@payloadcms/ui/elements/FileManager/FilePreview/PdfPreview'
import { VideoPreview } from '@payloadcms/ui/elements/FileManager/FilePreview/VideoPreview'
import type { FormState, SanitizedCollectionConfig, UploadEdits } from 'payload'
import { formatFilesize, isImage, validateMimeType } from 'payload/shared'
import React, { Fragment, useCallback, useEffect, useState } from 'react'

import { FilePreview } from '@/client/vendor/payload/elements/FileManager/FilePreview/index.js'
import { FileToolbar } from '@/client/vendor/payload/elements/FileManager/FileToolbar/index.js'
import { getEditorFileSrc } from '@/client/vendor/payload/elements/Upload/getEditorFileSrc.js'
import { editDrawerSlug, sizePreviewSlug } from '@/client/vendor/payload/elements/Upload/index.js'
import { UploadFromURLModal } from '@/client/vendor/payload/elements/Upload/UploadFromURLModal/index.js'
import { usePasteFromClipboard } from '@/client/vendor/payload/elements/Upload/usePasteFromClipboard.js'
import { useUploadFromUrl } from '@/client/vendor/payload/elements/Upload/useUploadFromUrl.js'
import { UploadDropzoneContent } from '@/client/vendor/payload/elements/UploadDropzoneContent/index.js'

const baseClass = 'file-manager'

export type FileManagerProps = {
  readonly collectionSlug: string
  readonly initialState?: FormState
  readonly resetUploadEdits?: () => void
  readonly updateUploadEdits?: (args: UploadEdits) => void
  readonly uploadConfig: Omit<SanitizedCollectionConfig['upload'], 'uploadInstructions'>
  readonly UploadControls?: React.ReactNode
  readonly uploadEdits?: UploadEdits
  readonly UploadFilePreview?: React.ReactNode
}

export const FileManager: React.FC<FileManagerProps> = ({
  collectionSlug,
  initialState,
  resetUploadEdits: resetUploadEditsFromProps,
  updateUploadEdits: updateUploadEditsFromProps,
  uploadConfig,
  UploadControls,
  uploadEdits: uploadEditsFromProps,
  UploadFilePreview,
}) => {
  const { openModal } = useModal()
  const { t } = useTranslation()
  const { setModified } = useForm()
  const { data } = useDocumentInfo()
  const validate = useCallback(
    (file: File | null | undefined) => {
      if (!file && file !== undefined) {
        return 'A file is required.'
      }
      if (file && (!file.name || file.name === '')) {
        return 'A file name is required.'
      }
      if (
        file instanceof File &&
        uploadConfig.mimeTypes?.length &&
        !validateMimeType(file.type, uploadConfig.mimeTypes)
      ) {
        return t('error:invalidFileType')
      }
      return true
    },
    [t, uploadConfig.mimeTypes],
  )
  const { errorMessage, setValue, showError, value } = useField<File>({
    path: 'file',
    validate,
  })
  const {
    setUploadControlFile,
    setUploadControlFileName,
    setUploadControlFileUrl,
    uploadControlFile,
    uploadControlFileUrl,
  } = useUploadControls()
  const uploadEditsContext = useUploadEdits()
  const resetUploadEdits = resetUploadEditsFromProps ?? uploadEditsContext.resetUploadEdits
  const updateUploadEdits = updateUploadEditsFromProps ?? uploadEditsContext.updateUploadEdits
  const uploadEdits = uploadEditsFromProps ?? uploadEditsContext.uploadEdits

  const [fileSrc, setFileSrc] = useState<null | string>(null)
  const [removedFile, setRemovedFile] = useState(false)
  const [filename, setFilename] = useState<string>(value?.name || '')
  const [selectedSize, setSelectedSize] = useState<null | string>(null)

  const acceptMimeTypes = uploadConfig.mimeTypes?.join(', ')
  const imageCacheTag = uploadConfig?.cacheTags && data?.updatedAt

  const hasVariants = (uploadConfig?.variants?.length ?? 0) > 0
  const hasImageAdjustments = Boolean(uploadConfig?.hasImageAdjustments)
  const focalPointEnabled = uploadConfig?.focalPoint === true
  const { crop: showCrop = true, focalPoint = true } = uploadConfig
  const showFocalPoint = focalPoint && (hasVariants || hasImageAdjustments || focalPointEnabled)

  const selectedSizeData = selectedSize ? (data?.variants?.[selectedSize] as Record<string, unknown>) : null
  const sidePanelFileSrc = (selectedSizeData?.url ?? data?.thumbnailURL ?? data?.url ?? null) as null | string
  const sidePanelMimeType = data?.mimeType as string | undefined
  const fileTypeIsAdjustable =
    !!sidePanelMimeType &&
    isImage(sidePanelMimeType) &&
    sidePanelMimeType !== 'image/svg+xml' &&
    sidePanelMimeType !== 'image/jxl'

  const renameFile = (fileToChange: File, newName: string): File =>
    new File([fileToChange], newName, {
      type: fileToChange.type,
      lastModified: fileToChange.lastModified,
    })

  const handleFileChange = useCallback(
    ({ file, isNewFile = true }: { file: File | null; isNewFile?: boolean }) => {
      if (
        file instanceof File &&
        uploadConfig.mimeTypes?.length &&
        !validateMimeType(file.type, uploadConfig.mimeTypes)
      ) {
        toast.error(t('error:invalidFileType'))
        return
      }
      if (isNewFile && file instanceof File) {
        setFileSrc(URL.createObjectURL(file))
      }
      setValue(file)
      setUploadControlFileUrl('')
      setUploadControlFileName(null as unknown as string)
      setUploadControlFile(null as unknown as File)
    },
    [setValue, setUploadControlFile, setUploadControlFileName, setUploadControlFileUrl, t, uploadConfig.mimeTypes],
  )

  const handleFileNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const updatedFileName = e.target.value
      if (value) {
        handleFileChange({ file: renameFile(value, updatedFileName), isNewFile: false })
        setFilename(updatedFileName)
      }
    },
    [handleFileChange, value],
  )

  const handleFileSelection = useCallback(
    (files: FileList) => handleFileChange({ file: files?.[0] }),
    [handleFileChange],
  )

  const handleFileFetchedFromUrl = useCallback((file: File) => handleFileChange({ file }), [handleFileChange])

  const { fileUrl, handleUrlSubmit, isValidUrl, setFileUrl } = useUploadFromUrl({
    collectionSlug,
    onFileFetched: handleFileFetchedFromUrl,
    uploadConfig,
  })

  const handlePasteFromClipboard = usePasteFromClipboard({
    handleFileSelection,
    handleUrlSubmit,
    setFileUrl,
    uploadConfig,
  })

  const handleFileRemoval = useCallback(() => {
    setRemovedFile(true)
    handleFileChange({ file: null })
    setFileSrc('')
    setFileUrl('')
    setSelectedSize(null)
    resetUploadEdits()
    setUploadControlFileUrl('')
    setUploadControlFileName(null as unknown as string)
    setUploadControlFile(null as unknown as File)
  }, [
    handleFileChange,
    resetUploadEdits,
    setFileUrl,
    setUploadControlFile,
    setUploadControlFileName,
    setUploadControlFileUrl,
  ])

  const onEditsSave = useCallback(
    (args: UploadEdits) => {
      setModified(true)
      updateUploadEdits(args)
    },
    [setModified, updateUploadEdits],
  )

  useEffect(() => {
    setSelectedSize(null)
    setRemovedFile(false)
    setFileSrc('')
  }, [data?.url, data?.filename])

  useEffect(() => {
    if (initialState?.file?.value instanceof File) {
      setFileSrc(URL.createObjectURL(initialState.file.value))
      setRemovedFile(false)
    }
  }, [initialState])

  useEffect(() => {
    return () => {
      if (fileSrc?.startsWith('blob:')) {
        URL.revokeObjectURL(fileSrc)
      }
    }
  }, [fileSrc])

  useEffect(() => {
    const handleControlFileUrl = async () => {
      if (uploadControlFileUrl) {
        setFileUrl(uploadControlFileUrl)
        await handleUrlSubmit()
      }
    }
    void handleControlFileUrl()
  }, [uploadControlFileUrl, handleUrlSubmit, setFileUrl])

  useEffect(() => {
    if (uploadControlFile) {
      handleFileChange({ file: uploadControlFile })
    }
  }, [uploadControlFile, handleFileChange])

  const renderSelectedFilePreview = (src: string) => {
    const fileType = value?.type ?? ''

    if (fileType.startsWith('video/')) {
      return (
        <div className={`${baseClass}__selected-preview`}>
          <VideoPreview fileSrc={src} />
        </div>
      )
    }

    if (fileType.startsWith('audio/')) {
      return (
        <div className={`${baseClass}__selected-preview ${baseClass}__selected-preview--audio`}>
          <AudioPreview fileSrc={src} />
        </div>
      )
    }

    if (fileType === 'application/pdf') {
      return (
        <div className={`${baseClass}__selected-preview`}>
          <PdfPreview fileSrc={src} title={value?.name} />
        </div>
      )
    }

    return (
      <div className={`${baseClass}__selected-preview`}>
        <Thumbnail collectionSlug={collectionSlug} fileSrc={(isImage(fileType) ? src : null) as string} size="expand" />
      </div>
    )
  }

  const drawers = (
    <Fragment>
      {(value || data?.filename) && (
        <EditDepthProvider>
          <EditUpload
            fileName={value?.name || (data?.filename as string)}
            fileSrc={getEditorFileSrc({ data, fileSrc, hasSelectedFile: Boolean(value) })}
            imageCacheTag={imageCacheTag}
            initialCrop={uploadEdits?.crop ?? undefined}
            initialFocalPoint={{
              x: uploadEdits?.focalPoint?.x || (data?.focalX as number) || 50,
              y: uploadEdits?.focalPoint?.y || (data?.focalY as number) || 50,
            }}
            onSave={onEditsSave}
            showCrop={showCrop}
            showFocalPoint={showFocalPoint}
          />
        </EditDepthProvider>
      )}
      {data && hasVariants && (
        <Drawer
          className={`${baseClass}__preview-drawer`}
          hoverTitle
          slug={sizePreviewSlug}
          title={t('upload:sizesFor', { label: data.filename })}
        >
          <PreviewSizes doc={data} imageCacheTag={imageCacheTag} uploadConfig={uploadConfig} />
        </Drawer>
      )}
      {uploadConfig?.pasteURL !== false && (
        <UploadFromURLModal
          fileUrl={fileUrl}
          handleUrlSubmit={handleUrlSubmit}
          isValidUrl={isValidUrl}
          setFileUrl={setFileUrl}
        />
      )}
    </Fragment>
  )

  const showUploadInput = Boolean(value) || removedFile || !uploadConfig?.hideFileInputOnCreate

  return (
    <div className={[fieldBaseClass, baseClass].filter(Boolean).join(' ')}>
      <FieldError message={errorMessage} path="filename" showError={showError} />
      <div className={`${baseClass}__panel`}>
        {data?.filename && !removedFile && (
          <FileToolbar
            filename={data.filename as string}
            fileSrc={sidePanelFileSrc}
            fileUrl={data?.url as string}
            hideRemoveFile={uploadConfig?.hideRemoveFile}
            isAdjustable={fileTypeIsAdjustable}
            onEditImage={() => openModal(editDrawerSlug)}
            onReplace={handleFileRemoval}
          />
        )}
        <div className={`${baseClass}__content`}>
          {data?.filename && !removedFile ? (
            <FilePreview
              collectionSlug={collectionSlug}
              data={data as Record<string, unknown>}
              imageCacheTag={imageCacheTag}
              selectedSize={selectedSize}
              selectedSizeData={selectedSizeData}
              setSelectedSize={setSelectedSize}
              uploadConfig={uploadConfig}
              UploadFilePreview={UploadFilePreview}
            />
          ) : showUploadInput ? (
            <div className={`${baseClass}__upload`}>
              {!value && removedFile && data?.filename && (
                <Button
                  aria-label={t('general:cancel')}
                  buttonStyle="secondary"
                  className={`${baseClass}__remove`}
                  icon="x"
                  onClick={() => setRemovedFile(false)}
                  round
                  tooltip={t('general:cancel')}
                />
              )}
              {!value && (
                <Dropzone onChange={handleFileSelection}>
                  <UploadDropzoneContent
                    acceptMimeTypes={acceptMimeTypes}
                    extraControls={UploadControls}
                    onFilesSelected={handleFileSelection}
                    onPasteFromClipboard={handlePasteFromClipboard}
                    pasteButtonClassName={`${baseClass}__pasteFromClipboard`}
                    pasteTooltip={t('upload:pasteURL')}
                  />
                </Dropzone>
              )}
              {value && fileSrc && (
                <Fragment>
                  <Button
                    aria-label={t('general:cancel')}
                    buttonStyle="secondary"
                    className={`${baseClass}__remove`}
                    icon="x"
                    onClick={handleFileRemoval}
                    round
                    tooltip={t('general:cancel')}
                  />
                  {renderSelectedFilePreview(fileSrc)}
                  <div className={`${baseClass}__file-adjustments`}>
                    <TextInput
                      id="field-filemanager-filename"
                      label={t('upload:fileName')}
                      onChange={handleFileNameChange}
                      path="filename"
                      value={filename || value.name}
                    />
                    {(value.size || value.type) && (
                      <span className={`${baseClass}__selected-meta`}>
                        {[value.size ? formatFilesize(value.size) : null, value.type].filter(Boolean).join(' – ')}
                      </span>
                    )}
                  </div>
                </Fragment>
              )}
            </div>
          ) : null}
        </div>
      </div>
      {drawers}
    </div>
  )
}
