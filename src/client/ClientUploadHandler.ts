'use client'

import { createClientUploadHandler } from '@payloadcms/plugin-cloud-storage/client'
import type { TFunction } from '@payloadcms/translations'
import { toast, useTranslation } from '@payloadcms/ui'
import { type ComponentProps, createElement, type FunctionComponentElement } from 'react'
import * as tus from 'tus-js-client'

import {
  getFinishedTusUpload,
  getTusAuthUrl,
  renewTusHeaders,
  shouldRetryTusRequest,
} from '@/client/TusUpload/tusAuth.js'
import type { PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys } from '@/shared/translations/index.js'
import type { StreamTusUploadData } from '@/shared/types/index.js'

const RETRY_DELAYS = [0, 1000, 3000]

const ClientUploadHandler: ReturnType<
  typeof createClientUploadHandler<{ t: TFunction<PluginStorageBunnyTranslationsKeys> }>
> = createClientUploadHandler<{ t: TFunction<PluginStorageBunnyTranslationsKeys> }>({
  name: 'bunny',
  handler: async ({ apiRoute, collectionSlug, data, file, props: { t }, serverURL }) => {
    if (!data || typeof data !== 'object') {
      const message = t('@seshuk/payload-storage-bunny:errorUploadFileFailed', { filename: file.name })
      toast.error(message)
      throw new Error(message)
    }
    const upload = data as StreamTusUploadData
    const toastId = `bunny-upload-${upload.videoId}`
    toast.loading(`${file.name}: 0%`, { id: toastId })
    try {
      await new Promise<void>((resolve, reject) => {
        new tus.Upload(file, {
          onBeforeRequest: renewTusHeaders({
            auth: upload,
            body: {
              collection: collectionSlug,
              filename: file.name,
              filesize: file.size,
              filetype: file.type,
              videoId: upload.videoId,
              videoToken: upload.videoToken,
            },
            url: getTusAuthUrl(serverURL, apiRoute),
          }),
          onError: (err) => {
            if (getFinishedTusUpload(err)) {
              resolve()
              return
            }
            // eslint-disable-next-line no-console
            console.error(err)
            reject(new Error(upload.errorMessage, { cause: err }))
          },
          onProgress: (bytesSent, bytesTotal) => {
            toast.loading(`${file.name}: ${bytesTotal ? Math.floor((bytesSent / bytesTotal) * 100) : 0}%`, {
              id: toastId,
            })
          },
          onShouldRetry: shouldRetryTusRequest,
          onSuccess: () => resolve(),
          retryDelays: RETRY_DELAYS,
          storeFingerprintForResuming: false,
          uploadUrl: upload.uploadUrl,
        }).start()
      })
    } catch (err) {
      toast.error(upload.errorMessage, { id: toastId })
      throw err
    }
    toast.dismiss(toastId)
  },
})

export const BunnyClientUploadHandler = (
  props: Omit<ComponentProps<typeof ClientUploadHandler>, 'props'>,
): FunctionComponentElement<ComponentProps<typeof ClientUploadHandler>> => {
  const { t } = useTranslation<PluginStorageBunnyTranslations, PluginStorageBunnyTranslationsKeys>()
  return createElement(ClientUploadHandler, { ...props, props: { t } })
}
