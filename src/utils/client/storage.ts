import type { BunnyStorageCredentials } from '@/types/index.js'

import { HTTPError } from 'ky'

import { getStorageUrl, TIMEOUTS } from '../constants.js'
import { kyClient } from '../kyClient.js'

export type { BunnyStorageCredentials }

export const deleteStorageFile = async ({
  apiKey,
  path,
  region,
  zoneName,
}: { path: string } & BunnyStorageCredentials): Promise<void> => {
  try {
    await kyClient.delete(`${getStorageUrl(region)}/${zoneName}/${path}`, {
      headers: {
        'Accept': 'application/json',
        'AccessKey': apiKey,
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
        'Accept': 'application/json',
        'AccessKey': apiKey,
        'Content-Type': mimeType,
      },
      timeout: timeout ?? TIMEOUTS.DEFAULT,
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
