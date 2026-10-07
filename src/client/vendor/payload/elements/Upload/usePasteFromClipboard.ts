'use client'
import { toast, useModal, useTranslation, useUploadControls } from '@payloadcms/ui'
import { getFileOrUrlFromClipboard } from '@payloadcms/ui/utilities/getFilesFromClipboard'
import type { SanitizedCollectionConfig } from 'payload'
import { validateMimeType } from 'payload/shared'
import { useCallback } from 'react'

import { pasteURLDrawerSlug } from '@/client/vendor/payload/elements/Upload/UploadFromURLModal/index.js'

type UsePasteFromClipboardArgs = {
  readonly handleFileSelection: (files: FileList) => void
  readonly handleUrlSubmit: (urlOverride?: string) => Promise<boolean>
  readonly setFileUrl: (url: string) => void
  readonly uploadConfig: Pick<SanitizedCollectionConfig['upload'], 'mimeTypes' | 'pasteURL'>
}

export const usePasteFromClipboard = ({
  handleFileSelection,
  handleUrlSubmit,
  setFileUrl,
  uploadConfig,
}: UsePasteFromClipboardArgs): (() => Promise<void>) => {
  const { openModal } = useModal()
  const { t } = useTranslation()
  const { setUploadControlFile, setUploadControlFileName, setUploadControlFileUrl } = useUploadControls()

  return useCallback(async () => {
    let result: Awaited<ReturnType<typeof getFileOrUrlFromClipboard>> = null
    let isClipboardAccessDenied = false

    try {
      result = await getFileOrUrlFromClipboard()
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        isClipboardAccessDenied = true
      } else {
        toast.error(t('error:unableToReadClipboard'))
        return
      }
    }

    if (result?.type === 'file') {
      const [pastedFile] = result.files
      if (uploadConfig?.mimeTypes?.length && !validateMimeType(pastedFile.type, uploadConfig.mimeTypes)) {
        toast.error(t('error:invalidFileType'))
        return
      }
      handleFileSelection(result.files)
      return
    }

    if (uploadConfig?.pasteURL === false) {
      toast.error(isClipboardAccessDenied ? t('error:unableToReadClipboard') : t('error:noFileFoundInClipboard'))
      return
    }

    if (result?.type === 'url') {
      setFileUrl(result.url)
      const didFetchSucceed = await handleUrlSubmit(result.url)
      if (!didFetchSucceed) {
        openModal(pasteURLDrawerSlug)
      }
      return
    }

    openModal(pasteURLDrawerSlug)
    setUploadControlFileUrl('')
    setUploadControlFile(null as unknown as File)
    setUploadControlFileName(null as unknown as string)
  }, [
    handleFileSelection,
    handleUrlSubmit,
    openModal,
    setFileUrl,
    setUploadControlFile,
    setUploadControlFileName,
    setUploadControlFileUrl,
    t,
    uploadConfig,
  ])
}
