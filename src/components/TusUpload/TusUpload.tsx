'use client'

import type { UploadProps as PayloadUploadProps } from '@payloadcms/ui/elements/Upload'
import type { ClientCollectionConfig } from 'payload'

import { matchesMimeTypePattern } from '@/utils/mimeTypes.js'
import {
  Upload as PayloadUpload,
  useBulkUpload,
  useConfig,
  useDocumentInfo,
  useUploadControls,
  useUploadEdits,
} from '@payloadcms/ui'
import React, { useCallback, useMemo, useState } from 'react'

import { ToggleButton } from './ToggleButton/ToggleButton.js'
import { clickFileFieldRemoveButton } from './TusUpload.utils.js'
import { Upload } from './Upload/Upload.js'

export const TusUpload: React.FC<PayloadUploadProps> = (props) => {
  const { onChange, UploadControls } = props

  const { collectionSlug: docSlug, initialState } = useDocumentInfo()
  const { getEntityConfig } = useConfig()
  const { resetUploadEdits } = useUploadEdits()
  const { setUploadControlFile, setUploadControlFileName, setUploadControlFileUrl } = useUploadControls()
  const bulkUploadContext = useBulkUpload()

  const [isTusMode, setIsTusMode] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const collectionConfig = useMemo(() => {
    return getEntityConfig({
      collectionSlug: docSlug,
    }) as ClientCollectionConfig
  }, [docSlug, getEntityConfig])

  const customCollectionConfig = useMemo(() => {
    return collectionConfig?.admin?.custom?.['@seshuk/payload-storage-bunny']
  }, [collectionConfig])

  const allowedMimeTypes = useMemo(() => {
    return customCollectionConfig?.stream?.mimeTypes || []
  }, [customCollectionConfig])

  const collectionSlug = collectionConfig?.slug || ''
  const isBulkUpload = !!bulkUploadContext?.collectionSlug
  const isAutoModeEnabled = customCollectionConfig?.stream?.tus?.autoMode === true && !isBulkUpload
  const isTusEnabled = customCollectionConfig?.stream?.tus !== undefined && !isBulkUpload

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
      void clickFileFieldRemoveButton()
    }

    setIsTusMode(false)
    setSelectedFile(null)
    clearUploadControls()
  }, [clearUploadControls, isAutoModeEnabled])

  const handleFileSelect = useCallback(
    (file?: File) => {
      if (onChange) {
        onChange(file)
      }

      const isMimeTypeAllowed = file
        ? allowedMimeTypes.some((pattern: string) => matchesMimeTypePattern(file.type, pattern))
        : false

      if (file && !isTusMode && isAutoModeEnabled && isMimeTypeAllowed) {
        setSelectedFile(file)
        clearUploadControls()

        void clickFileFieldRemoveButton()

        handleEnableTus()
      }
    },
    [allowedMimeTypes, clearUploadControls, handleEnableTus, isAutoModeEnabled, isTusMode, onChange],
  )

  const combinedUploadControls = useMemo(() => {
    if (isAutoModeEnabled || !isTusEnabled) {
      return UploadControls || null
    }

    return (
      <>
        {UploadControls}
        <ToggleButton isEnabled={false} onToggle={handleEnableTus} />
      </>
    )
  }, [handleEnableTus, isAutoModeEnabled, isTusEnabled, UploadControls])

  return (
    <div>
      <div style={{ display: isTusMode ? 'none' : 'block' }}>
        <PayloadUpload
          collectionSlug={collectionSlug}
          initialState={initialState}
          onChange={handleFileSelect}
          uploadConfig={collectionConfig?.upload}
          UploadControls={combinedUploadControls}
        />
      </div>

      {isTusMode && (
        <Upload
          collectionSlug={collectionSlug}
          isAutoMode={isAutoModeEnabled}
          onDisableTus={handleDisableTus}
          preSelectedFile={selectedFile}
        />
      )}
    </div>
  )
}

export default TusUpload
