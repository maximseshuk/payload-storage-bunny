'use client'

import type { UploadProps as PayloadUploadProps } from '@payloadcms/ui/elements/Upload'
import type { ClientCollectionConfig } from 'payload'

import {
  Upload as PayloadUpload,
  useBulkUpload,
  useConfig,
  useDocumentInfo,
  useForm,
  useUploadControls,
  useUploadEdits,
} from '@payloadcms/ui'
import React, { useCallback, useMemo, useState } from 'react'

import { ToggleControl } from './ToggleButton/index.js'
import { Upload } from './Upload/index.js'

export const TusUpload: React.FC<PayloadUploadProps> = (props) => {
  const { onChange, UploadControls } = props

  const { collectionSlug: docSlug, initialState } = useDocumentInfo()
  const { getEntityConfig } = useConfig()
  const { dispatchFields } = useForm()
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

  const tusCustomConfig = useMemo(() => {
    return collectionConfig?.admin?.custom?.['@seshuk/payload-storage-bunny']
  }, [collectionConfig])

  const allowedMimeTypes = useMemo(() => {
    return tusCustomConfig?.tusMimeTypes || []
  }, [tusCustomConfig])

  const collectionSlug = collectionConfig?.slug || ''
  const isBulkUpload = !!bulkUploadContext?.collectionSlug
  const isAutoModeEnabled = tusCustomConfig?.tusAutoMode === true && !isBulkUpload
  const isTusEnabled = tusCustomConfig?.tusEnabled === true && !isBulkUpload

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
      const payloadRemoveButton = document.querySelector('.file-field__upload .file-field__remove')
      if (payloadRemoveButton) {
        ;(payloadRemoveButton as HTMLButtonElement).click()
      }
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

      if (file && !isTusMode && isAutoModeEnabled && allowedMimeTypes.includes(file.type)) {
        setSelectedFile(file)
        clearUploadControls()

        dispatchFields({ type: 'UPDATE', path: 'file', value: null })

        handleEnableTus()
      }
    },
    [allowedMimeTypes, clearUploadControls, dispatchFields, handleEnableTus, isAutoModeEnabled, isTusMode, onChange],
  )

  const combinedUploadControls = useMemo(() => {
    if (isAutoModeEnabled || !isTusEnabled) {
      return UploadControls || null
    }

    return (
      <>
        {UploadControls}
        <ToggleControl isEnabled={false} onToggle={handleEnableTus} />
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
