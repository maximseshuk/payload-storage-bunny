import { Button, useTranslation } from '@payloadcms/ui'
import React, { Fragment } from 'react'

import type { PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys } from '@/shared/translations/index.js'

import './ToggleButton.css'

type ToggleButtonProps = {
  isEnabled: boolean
  onToggle: () => void
}

export const ToggleButton: React.FC<ToggleButtonProps> = ({ isEnabled, onToggle }) => {
  const { t } = useTranslation<PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys>()

  return (
    <Fragment>
      <span className="upload-dropzone-content__or-text storage-bunny-tus-upload__toggle-or">{t('general:or')}</span>
      <Button
        buttonStyle={isEnabled ? 'primary' : 'secondary'}
        className="storage-bunny-tus-upload__toggle"
        margin={false}
        onClick={onToggle}
        size="medium"
      >
        {isEnabled
          ? t('@seshuk/payload-storage-bunny:tusUploadDisableMode')
          : t('@seshuk/payload-storage-bunny:tusUploadEnableMode')}
      </Button>
    </Fragment>
  )
}
