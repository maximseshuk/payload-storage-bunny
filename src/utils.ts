import type { TypeWithID } from 'payload'

import type { BunnyStorageOptions, BunnyVideoMeta } from './types.js'

export const getStorageUrl = (region: string | undefined) => {
  if (!region) {
    return 'storage.bunnycdn.com'
  }

  return `${region}.storage.bunnycdn.com`
}

export const getVideoFromDoc = (doc: TypeWithID | undefined, filename: string) => {
  if (
    doc &&
    typeof doc === 'object' &&
    'id' in doc &&
    'filename' in doc &&
    doc.filename === filename &&
    'bunnyVideoId' in doc
  ) {
    return {
      docId: doc.id,
      videoId: doc.bunnyVideoId as string,
      videoMeta: ('bunnyVideoMeta' in doc ? doc.bunnyVideoMeta : null) as BunnyVideoMeta | null,
    }
  }

  return undefined
}

export const isImage = (mimeType: string) => mimeType.startsWith('image/')
export const isVideo = (mimeType: string) => mimeType.startsWith('video/')

export const validateOptions = (
  storageOptions: BunnyStorageOptions,
): void => {
  const errors: string[] = []

  if (storageOptions.options.storage.hostname.includes('storage.bunnycdn.com')) {
    errors.push('Hostname in storage settings cannot contain "storage.bunnycdn.com"')
  }

  if (storageOptions.options.stream) {
    const collectionsWithAccessControl = Object.entries(storageOptions.collections).filter(([_, collection]) =>
      typeof collection === 'object' &&
      collection.disablePayloadAccessControl !== true,
    )

    const mp4FallbackEnabled = storageOptions.options.stream.mp4Fallback?.enabled ||
      !!storageOptions.options.stream.mp4FallbackQuality

    if (collectionsWithAccessControl.length > 0 && !mp4FallbackEnabled) {
      const collectionNames = collectionsWithAccessControl.map(([key]) => key).join(', ')
      errors.push(
        `Collections [${collectionNames}] have disablePayloadAccessControl disabled, mp4Fallback must be enabled`,
      )
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Bunny Storage configuration error: ${errors.join('; ')}. Please refer to the documentation: https://github.com/maximseshuk/payload-storage-bunny`,
    )
  }
}