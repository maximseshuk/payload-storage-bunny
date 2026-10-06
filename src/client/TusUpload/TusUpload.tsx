'use client'

import {
  useBulkUpload,
  useConfig,
  useDocumentInfo,
  useFormFields,
  useModal,
  useUploadControls,
  useUploadEdits,
} from '@payloadcms/ui'
import {
  FileManager as PayloadFileManager,
  type FileManagerProps as PayloadFileManagerProps,
} from '@payloadcms/ui/elements/FileManager'
import type { ClientCollectionConfig } from 'payload'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { FileManager } from '@/client/TusUpload/FileManager/FileManager.js'
import { ToggleButton } from '@/client/TusUpload/ToggleButton/ToggleButton.js'
import { matchesMimeTypePattern } from '@/shared/mimeTypes.js'

import { clickFileFieldRemoveButton } from './TusUpload.utils.js'

export const TusUpload: React.FC = () => {
  const { collectionSlug: docSlug, initialState } = useDocumentInfo()
  const { getEntityConfig } = useConfig()
  const { resetUploadEdits } = useUploadEdits()
  const { setUploadControlFile, setUploadControlFileName, setUploadControlFileUrl } = useUploadControls()
  const bulkUploadContext = useBulkUpload()
  const { isModalOpen } = useModal()
  const fileValue = useFormFields(([fields]) => fields?.file?.value)
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

  const handleDisableTus = useCallback(() => {
    if (isAutoModeEnabled) {
      void removeFileManagerFile()
    }

    setIsTusMode(false)
    setSelectedFile(null)
    clearUploadControls()
  }, [clearUploadControls, isAutoModeEnabled, removeFileManagerFile])

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

  const uploadControls = useMemo(() => {
    if (isAutoModeEnabled || !isTusEnabled) {
      return null
    }

    return <ToggleButton isEnabled={false} onToggle={handleEnableTus} />
  }, [handleEnableTus, isAutoModeEnabled, isTusEnabled])

  return (
    <>
      <div ref={fileManagerRef} style={{ display: isTusMode ? 'none' : 'contents' }}>
        <PayloadFileManager
          collectionSlug={collectionSlug}
          initialState={initialState}
          uploadConfig={collectionConfig?.upload as PayloadFileManagerProps['uploadConfig']}
          UploadControls={uploadControls}
        />
      </div>

      {isTusMode && (
        <FileManager
          collectionSlug={collectionSlug}
          isAutoMode={isAutoModeEnabled}
          onDisableTus={handleDisableTus}
          preSelectedFile={selectedFile}
        />
      )}
    </>
  )
}

export default TusUpload
