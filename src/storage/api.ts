import { HTTPError } from 'ky'

import { getStorageUrl, TIMEOUTS } from '@/utils/constants.js'
import { kyClient } from '@/utils/kyClient.js'

export type BunnyStorageCredentials = {
  apiKey: string
  region?: string
  zoneName: string
}

export const deleteStorageFile = async ({
  apiKey,
  path,
  region,
  zoneName,
}: { path: string } & BunnyStorageCredentials): Promise<void> => {
  try {
    await kyClient.delete(`${getStorageUrl(region)}/${zoneName}/${path}`, {
      headers: {
        Accept: 'application/json',
        AccessKey: apiKey,
      },
      timeout: TIMEOUTS.DEFAULT,
    })
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 400) {
        throw new Error('Bunny Storage: Delete failed', { cause: err })
      }
    }

    throw new Error(`Unable to delete file: ${path}`, { cause: err })
  }
}

export const uploadStorageFile = async ({
  apiKey,
  buffer,
  mimeType,
  path,
  region,
  timeout,
  zoneName,
}: {
  buffer: Buffer
  mimeType: string
  path: string
  timeout?: number
} & BunnyStorageCredentials): Promise<void> => {
  try {
    await kyClient.put(`${getStorageUrl(region)}/${zoneName}/${path}`, {
      body: buffer as unknown as BodyInit,
      headers: {
        Accept: 'application/json',
        AccessKey: apiKey,
        'Content-Type': mimeType,
      },
      timeout: timeout ?? TIMEOUTS.DEFAULT,
    })
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 400) {
        throw new Error('Bunny Storage: Upload failed', { cause: err })
      } else if (err.response.status === 401) {
        throw new Error('Bunny Storage: Invalid access key, region, or file format', { cause: err })
      }
    }

    throw new Error(`Unable to upload file: ${path}`, { cause: err })
  }
}
