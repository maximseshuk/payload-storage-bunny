'use client'

import {
  useBulkUpload,
  useConfig,
  useDocumentInfo,
  useForm,
  useFormFields,
  useModal,
  useUploadControls,
  useUploadEdits,
} from '@payloadcms/ui'
import type { ClientCollectionConfig } from 'payload'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { FileManager } from '@/client/TusUpload/FileManager/FileManager.js'
import { ToggleButton } from '@/client/TusUpload/ToggleButton/ToggleButton.js'
import {
  FileManager as PayloadFileManager,
  type FileManagerProps as PayloadFileManagerProps,
} from '@/client/vendor/payload/elements/FileManager/index.js'
import { matchesMimeTypePattern } from '@/shared/mimeTypes.js'

import { FILE_FIELD_REMOVE_BUTTON_SELECTOR } from './TusUpload.constants.js'
import { clickFileFieldRemoveButton } from './TusUpload.utils.js'

export const TusUpload: React.FC<Pick<PayloadFileManagerProps, 'UploadControls' | 'UploadFilePreview'>> = ({
  UploadControls,
  UploadFilePreview,
}) => {
  const { collectionSlug: docSlug, data: savedDoc, initialState } = useDocumentInfo()
  const { getEntityConfig } = useConfig()
  const { resetUploadEdits } = useUploadEdits()
  const { setUploadControlFile, setUploadControlFileName, setUploadControlFileUrl } = useUploadControls()
  const bulkUploadContext = useBulkUpload()
  const { isModalOpen } = useModal()
  const { dispatchFields } = useForm()
  const fileField = useFormFields(([fields]) => fields?.file)
  const fileValue = fileField?.value
  const fileManagerRef = useRef<HTMLDivElement>(null)

  const [isTusMode, setIsTusMode] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const collectionConfig = useMemo(() => {
    return getEntityConfig({
      collectionSlug: docSlug,
    }) as ClientCollectionConfig
  }, [docSlug, getEntityConfig])

  const customCollectionOptions = useMemo(() => {
    return collectionConfig?.admin?.custom?.['@seshuk/payload-storage-bunny']
  }, [collectionConfig])

  const allowedMimeTypes = useMemo(() => {
    return customCollectionOptions?.stream?.mimeTypes || []
  }, [customCollectionOptions])

  const collectionSlug = collectionConfig?.slug || ''
  const isBulkUpload = !!bulkUploadContext?.collectionSlug && isModalOpen(bulkUploadContext.modalSlug)
  const isAutoModeEnabled = customCollectionOptions?.stream?.tus?.autoMode === true && !isBulkUpload
  const isTusEnabled = customCollectionOptions?.stream?.tus !== undefined && !isBulkUpload

  const removeFileManagerFile = useCallback(() => clickFileFieldRemoveButton(fileManagerRef.current), [])

  const clearUploadControls = useCallback(() => {
    resetUploadEdits()
    setUploadControlFileUrl('')
    setUploadControlFile(null as unknown as File)
    setUploadControlFileName(null as unknown as string)
  }, [resetUploadEdits, setUploadControlFile, setUploadControlFileName, setUploadControlFileUrl])

  const handleEnableTus = useCallback(() => {
    setIsTusMode(true)
    clearUploadControls()
  }, [clearUploadControls])

  const disableTus = useCallback(
    (showSavedFile: boolean) => {
      if (showSavedFile) {
        fileManagerRef.current?.querySelector<HTMLButtonElement>(FILE_FIELD_REMOVE_BUTTON_SELECTOR)?.click()
      }

      setIsTusMode(false)
      setSelectedFile(null)
      clearUploadControls()
    },
    [clearUploadControls],
  )

  const handleDisableTus = useCallback(() => disableTus(isAutoModeEnabled), [disableTus, isAutoModeEnabled])

  const handleCancelTus = useCallback(() => {
    if (savedDoc?.filename) {
      disableTus(true)
    }
  }, [disableTus, savedDoc?.filename])

  useEffect(() => {
    if (!(fileValue instanceof File) || isTusMode || !isAutoModeEnabled) {
      return
    }

    const isMimeTypeAllowed = allowedMimeTypes.some((pattern: string) =>
      matchesMimeTypePattern(fileValue.type, pattern),
    )

    if (isMimeTypeAllowed) {
      const switchToTus = async () => {
        await removeFileManagerFile()
        setSelectedFile(fileValue)
        handleEnableTus()
      }

      void switchToTus()
    }
  }, [allowedMimeTypes, fileValue, handleEnableTus, isAutoModeEnabled, isTusMode, removeFileManagerFile])

  useEffect(() => {
    if (isTusMode && fileField?.value) {
      dispatchFields({ type: 'UPDATE', path: 'file', value: null })
    }
  }, [dispatchFields, fileField, isTusMode])

  const uploadControls = useMemo(() => {
    if (isBulkUpload) {
      return null
    }
    if (isAutoModeEnabled || !isTusEnabled) {
      return UploadControls
    }

    return (
      <>
        {UploadControls}
        <ToggleButton isEnabled={false} onToggle={handleEnableTus} />
      </>
    )
  }, [handleEnableTus, isAutoModeEnabled, isBulkUpload, isTusEnabled, UploadControls])

  return (
    <>
      <div ref={fileManagerRef} style={{ display: isTusMode ? 'none' : 'contents' }}>
        <PayloadFileManager
          collectionSlug={collectionSlug}
          initialState={initialState}
          uploadConfig={collectionConfig?.upload as PayloadFileManagerProps['uploadConfig']}
          UploadControls={uploadControls}
          UploadFilePreview={UploadFilePreview}
        />
      </div>

      {isTusMode && (
        <FileManager
          collectionSlug={collectionSlug}
          isAutoMode={isAutoModeEnabled}
          onCancel={handleCancelTus}
          onDisableTus={handleDisableTus}
          preSelectedFile={fileValue instanceof File ? fileValue : selectedFile}
          UploadControls={UploadControls}
        />
      )}
    </>
  )
}

export default TusUpload
