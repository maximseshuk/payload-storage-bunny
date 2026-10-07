'use client'
import {
  Button,
  ChevronIcon,
  CopyToClipboard,
  LinkIcon,
  NewTabIcon,
  Popup,
  PopupList,
  SwapIcon,
  useTranslation,
} from '@payloadcms/ui'
import { useElementHeightVariable } from '@payloadcms/ui/hooks/useElementHeightVariable'
import { CropIcon } from '@payloadcms/ui/icons/Crop'
import { DownloadIcon } from '@payloadcms/ui/icons/Download'
import React, { useRef } from 'react'

const baseClass = 'file-toolbar'

type Props = {
  readonly filename: string
  readonly fileSrc?: null | string
  readonly fileUrl?: null | string
  readonly hideRemoveFile?: boolean
  readonly isAdjustable?: boolean
  readonly onEditImage?: () => void
  readonly onReplace?: () => void
}

export const FileToolbar: React.FC<Props> = ({
  filename,
  fileSrc,
  fileUrl,
  hideRemoveFile,
  isAdjustable,
  onEditImage,
  onReplace,
}) => {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  useElementHeightVariable({ cssVar: '--file-toolbar-height', ref })

  return (
    <div className={baseClass} ref={ref}>
      <div className={`${baseClass}__left`}>
        {hideRemoveFile ? (
          <span className={`${baseClass}__filename-btn ${baseClass}__filename-btn--static`}>
            <span className={`${baseClass}__filename-text`}>{filename}</span>
          </span>
        ) : (
          <Popup
            button={
              <span className={`${baseClass}__filename-btn`}>
                <span className={`${baseClass}__filename-text`}>{filename}</span>
                <ChevronIcon size={16} />
              </span>
            }
            buttonType="custom"
            horizontalAlign="left"
            popupType="menu"
            portalClassName={`${baseClass}__filename-popup`}
            size="fit-content"
            verticalAlign="bottom"
          >
            <PopupList.MenuItem>
              <PopupList.Button icon={<SwapIcon />} onClick={onReplace}>
                {t('upload:replaceFile')}
              </PopupList.Button>
            </PopupList.MenuItem>
          </Popup>
        )}
      </div>

      <div className={`${baseClass}__right`}>
        {fileUrl && <CopyToClipboard defaultMessage={t('upload:copyLinkToFile')} icon={<LinkIcon />} value={fileUrl} />}
        {isAdjustable && (
          <Button
            aria-label={t('upload:editImage')}
            buttonStyle="ghost"
            icon={<CropIcon size={24} />}
            margin={false}
            onClick={onEditImage}
            round={false}
            tooltip={t('upload:editImage')}
          />
        )}
        {fileSrc && (
          <a
            aria-label={t('fields:openInNewTab')}
            className={`${baseClass}__icon-link`}
            href={fileSrc}
            rel="noopener noreferrer"
            target="_blank"
            title={t('fields:openInNewTab')}
          >
            <NewTabIcon size={24} />
          </a>
        )}
        {fileSrc && (
          <a
            aria-label={t('upload:download')}
            className={`${baseClass}__icon-link`}
            download={filename}
            href={fileSrc}
            title={t('upload:download')}
          >
            <DownloadIcon size={24} />
          </a>
        )}
      </div>
    </div>
  )
}
