import type { PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys } from '@/translations/index.js'

import { Button, useTranslation } from '@payloadcms/ui'

import './index.scss'

import React, { Fragment } from 'react'

type ToggleControlProps = {
  isEnabled: boolean
  onToggle: () => void
}

export const ToggleControl: React.FC<ToggleControlProps> = ({ isEnabled, onToggle }) => {
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
