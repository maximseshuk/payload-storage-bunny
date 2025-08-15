'use client'

import {
  FormSubmit,
  useDocumentInfo,
  useEditDepth,
  useForm,
  useFormModified,
  useHotkey,
  useOperation,
  useTranslation,
} from '@payloadcms/ui'
import { reduceFieldsToValues } from 'payload/shared'
import React, { useRef } from 'react'

export interface CustomSaveButtonProps {
  label?: string
}

export const CustomSaveButton: React.FC<CustomSaveButtonProps> = ({ label: labelProp }) => {
  const { uploadStatus } = useDocumentInfo()
  const { t } = useTranslation()
  const { getField, getFields, replaceState, submit } = useForm()
  const modified = useFormModified()
  const label = labelProp || t('general:save')
  const ref = useRef<HTMLButtonElement>(null)
  const editDepth = useEditDepth()
  const operation = useOperation()

  const disabled = (operation === 'update' && !modified) || uploadStatus === 'uploading'

  useHotkey(
    {
      cmdCtrlKey: true,
      editDepth,
      keyCodes: ['t'],
    },
    (e) => {
      if (disabled) {
        // absorb the event
      }
      e.preventDefault()
      e.stopPropagation()
      if (ref?.current) {
        ref.current.click()
      }
    },
  )

  const handleSubmit = () => {
    if (uploadStatus === 'uploading') {
      return
    }

    void submit({
      overrides: (formState) => {
        const data = reduceFieldsToValues(formState, true) as Record<string, unknown>

        const urlField = getField('url')
        if (urlField && urlField.initialValue === data.url) {
          data.url = undefined
        }

        return data as unknown as FormData
      },
    })

    const currentState = { ...getFields(), file: { value: undefined } }
    replaceState(currentState)
  }

  return (
    <FormSubmit buttonId="action-save" disabled={disabled} onClick={handleSubmit} ref={ref} size="medium" type="button">
      {label}
    </FormSubmit>
  )
}
