import * as tus from 'tus-js-client'

import { BUNNY_API } from '@/shared/constants.js'

export const findPreviousTusUploads = async (
  file: File,
  metadata?: Record<string, string>,
): Promise<tus.PreviousUpload[]> => {
  try {
    const tempUpload = new tus.Upload(file, {
      endpoint: BUNNY_API.TUS_ENDPOINT,
      metadata,
    })

    return await tempUpload.findPreviousUploads()
  } catch {
    return []
  }
}

export const cleanupTusLocalStorage = async (file: File, videoId: string): Promise<void> => {
  try {
    const tempUpload = new tus.Upload(file, {
      endpoint: BUNNY_API.TUS_ENDPOINT,
      metadata: { videoId },
    })

    const { options } = tempUpload
    const { fingerprint, urlStorage } = options

    if (!fingerprint || !urlStorage) {
      return
    }

    const fp = await fingerprint(file, options)

    const uploads = fp ? await urlStorage.findUploadsByFingerprint(fp) : []

    const uploadsToRemove = uploads.filter((u) => u.metadata?.videoId === videoId)

    await Promise.all(
      uploadsToRemove.map((u) => (u.urlStorageKey ? urlStorage.removeUpload(u.urlStorageKey) : Promise.resolve())),
    )
  } catch {
    /* empty */
  }
}
