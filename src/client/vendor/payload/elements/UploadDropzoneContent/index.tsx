'use client'

import { Button, useTranslation } from '@payloadcms/ui'
import React from 'react'

const baseClass = 'upload-dropzone-content'

export type UploadDropzoneContentProps = {
  readonly acceptMimeTypes?: string
  readonly className?: string
  readonly extraControls?: React.ReactNode
  readonly multiple?: boolean
  readonly onFilesSelected: (files: FileList) => void
  readonly onPasteFromClipboard: () => void
  readonly pasteButtonClassName?: string
  readonly pasteTooltip: string
}

export function UploadDropzoneContent({
  acceptMimeTypes,
  className,
  extraControls,
  multiple,
  onFilesSelected,
  onPasteFromClipboard,
  pasteButtonClassName,
  pasteTooltip,
}: UploadDropzoneContentProps) {
  const { t } = useTranslation()
  const inputRef = React.useRef<HTMLInputElement>(null)

  return (
    <div className={[baseClass, className].filter(Boolean).join(' ')}>
      <div className={`${baseClass}__buttons`}>
        <Button buttonStyle="secondary" onClick={() => inputRef.current?.click()} size="medium">
          {t('upload:selectFile')}
        </Button>
        <input
          accept={acceptMimeTypes}
          aria-hidden="true"
          className={`${baseClass}__hidden-input`}
          hidden
          multiple={multiple}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onFilesSelected(e.target.files)
            }
          }}
          ref={inputRef}
          type="file"
        />
        <span className={`${baseClass}__or-text`}>{t('general:or')}</span>
        <Button
          buttonStyle="secondary"
          className={[`${baseClass}__pasteFromClipboard`, pasteButtonClassName].filter(Boolean).join(' ')}
          icon="clipboard"
          onClick={onPasteFromClipboard}
          size="medium"
          tooltip={pasteTooltip}
        />
        {extraControls}
      </div>
      <p className={`${baseClass}__drag-text`}>
        {t('general:or')} {t('upload:dragAndDrop')}
      </p>
    </div>
  )
}
