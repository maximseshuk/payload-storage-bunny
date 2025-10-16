import type { PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys } from '@/translations/index.js'

import { Button, useTranslation } from '@payloadcms/ui'
import React, { Fragment } from 'react'

import './ToggleButton.scss'

type ToggleButtonProps = {
  isEnabled: boolean
  onToggle: () => void
}

export const ToggleButton: React.FC<ToggleButtonProps> = ({ isEnabled, onToggle }) => {
  const { t } = useTranslation<PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys>()

  return (
    <Fragment>
      <span className="storage-bunny-tus-upload--toggle-control__or-text">{t('general:or')}</span>
      <Button buttonStyle={isEnabled ? 'primary' : 'pill'} onClick={onToggle} size="small">
        {isEnabled
          ? t('@seshuk/payload-storage-bunny:tusUploadDisableMode')
          : t('@seshuk/payload-storage-bunny:tusUploadEnableMode')}
      </Button>
    </Fragment>
  )
}
