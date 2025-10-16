import * as tus from 'tus-js-client'

const TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload'

export async function findPreviousTusUploads(
  file: File,
  metadata?: Record<string, string>,
): Promise<tus.PreviousUpload[]> {
  try {
    const tempUpload = new tus.Upload(file, {
      endpoint: TUS_ENDPOINT,
      metadata,
    })

    return await tempUpload.findPreviousUploads()
  } catch {
    return []
  }
}

export async function cleanupTusLocalStorage(file: File, videoId: string): Promise<void> {
  try {
    const tempUpload = new tus.Upload(file, {
      endpoint: TUS_ENDPOINT,
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
      uploadsToRemove.map((u) =>
        u.urlStorageKey ? urlStorage.removeUpload(u.urlStorageKey) : Promise.resolve(),
      ),
    )

  } catch { /* empty */ }
}
