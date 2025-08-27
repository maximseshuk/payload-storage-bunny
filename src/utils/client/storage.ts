import type { NormalizedStorageConfig } from '@/types/index.js'

import { HTTPError } from 'ky'

import { getStorageUrl, TIMEOUTS } from '../constants.js'
import { kyClient } from '../kyClient.js'

export const deleteStorageFile = async ({
  path,
  storageConfig,
}: {
  path: string
  storageConfig: NormalizedStorageConfig
}): Promise<void> => {
  try {
    await kyClient.delete(`${getStorageUrl(storageConfig.region)}/${storageConfig.zoneName}/${path}`, {
      headers: {
        'Accept': 'application/json',
        'AccessKey': storageConfig.apiKey,
      },
      timeout: TIMEOUTS.DEFAULT,
    })
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 400) {
        throw new Error('Bunny Storage: Delete failed')
      }
    }

    throw new Error(`Unable to delete file: ${path}`)
  }
}

export const uploadStorageFile = async ({
  buffer,
  mimeType,
  path,
  storageConfig,
}: {
  buffer: Buffer
  mimeType: string
  path: string
  storageConfig: NormalizedStorageConfig
}): Promise<void> => {
  try {
    await kyClient.put(`${getStorageUrl(storageConfig.region)}/${storageConfig.zoneName}/${path}`, {
      body: buffer,
      headers: {
        'Accept': 'application/json',
        'AccessKey': storageConfig.apiKey,
        'Content-Type': mimeType,
      },
      timeout: storageConfig.uploadTimeout,
    })
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 400) {
        throw new Error('Bunny Storage: Upload failed')
      } else if (err.response.status === 401) {
        throw new Error('Bunny Storage: Invalid access key, region, or file format')
      }
    }

    throw new Error(`Unable to upload file: ${path}`)
  }
}
