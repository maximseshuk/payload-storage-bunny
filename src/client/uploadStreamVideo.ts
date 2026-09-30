import * as tus from 'tus-js-client'

import { BUNNY_API } from '@/shared/constants.js'
import type { StreamClientUploadContext, StreamTusAuthResponse } from '@/shared/types/index.js'

import { TUS_RETRY_DELAYS } from './TusUpload/Upload/Upload.constants.js'

type UploadStreamVideoArgs = {
  apiRoute: string
  collectionSlug: string
  file: File
  head: string
  serverURL: string
}

export const uploadStreamVideo = async ({
  apiRoute,
  collectionSlug,
  file,
  head,
  serverURL,
}: UploadStreamVideoArgs): Promise<StreamClientUploadContext> => {
  const response = await fetch(`${serverURL}${apiRoute}/storage-bunny/stream/tus-auth`, {
    body: JSON.stringify({
      collection: collectionSlug,
      filename: file.name,
      filesize: file.size,
      filetype: file.type,
      head,
    }),
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`Failed to prepare Bunny Stream upload (${response.status})`)
  }

  const authData = (await response.json()) as StreamTusAuthResponse
  const { clientUploadContext } = authData
  if (!clientUploadContext) {
    throw new Error('Bunny Stream upload response is missing the client upload context')
  }
  if (authData.type !== 'upload') {
    return clientUploadContext
  }

  await new Promise<void>((resolve, reject) => {
    new tus.Upload(file, {
      endpoint: BUNNY_API.TUS_ENDPOINT,
      headers: {
        AuthorizationExpire: authData.authorizationExpire.toString(),
        AuthorizationSignature: authData.authorizationSignature,
        LibraryId: authData.libraryId.toString(),
        VideoId: authData.videoId,
      },
      metadata: {
        filetype: file.type,
        title: file.name,
        videoId: authData.videoId,
        videoToken: authData.videoToken,
        ...(typeof authData.thumbnailTime === 'number' && { thumbnailTime: authData.thumbnailTime.toString() }),
      },
      onError: reject,
      onSuccess: () => resolve(),
      retryDelays: TUS_RETRY_DELAYS,
      storeFingerprintForResuming: false,
    }).start()
  })

  return clientUploadContext
}
