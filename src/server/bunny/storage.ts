import { bunnyRequest } from '@/server/bunny/client.js'
import { getStorageUrl, TIMEOUTS } from '@/shared/constants.js'

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
  await bunnyRequest({
    apiKey,
    genericError: `Unable to delete file: ${path}`,
    method: 'delete',
    statusErrors: {
      400: 'Bunny Storage: Delete failed',
    },
    timeout: TIMEOUTS.DEFAULT,
    url: `${getStorageUrl(region)}/${zoneName}/${path}`,
  })
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
  await bunnyRequest({
    apiKey,
    body: buffer as unknown as BodyInit,
    contentType: mimeType,
    genericError: `Unable to upload file: ${path}`,
    method: 'put',
    statusErrors: {
      400: 'Bunny Storage: Upload failed',
      401: 'Bunny Storage: Invalid access key, region, or file format',
    },
    timeout: timeout ?? TIMEOUTS.DEFAULT,
    url: `${getStorageUrl(region)}/${zoneName}/${path}`,
  })
}
