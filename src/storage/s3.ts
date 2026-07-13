import { S3mini } from 's3mini'

import type { StorageS3Config } from '@/types/config.js'
import { TIMEOUTS } from '@/utils/constants.js'

export type BunnyStorageS3Credentials = {
  apiKey: string
  s3: StorageS3Config
  zoneName: string
}

export const getS3Endpoint = (region: string): string => `https://${region}-s3.storage.bunnycdn.com`

const createS3Client = ({ apiKey, s3, zoneName }: BunnyStorageS3Credentials, requestAbortTimeout?: number): S3mini =>
  new S3mini({
    accessKeyId: zoneName,
    endpoint: `${getS3Endpoint(s3.region)}/${zoneName}`,
    region: s3.region,
    requestAbortTimeout,
    secretAccessKey: apiKey,
  })

export const uploadStorageFileS3 = async ({
  apiKey,
  buffer,
  mimeType,
  path,
  s3,
  timeout,
  zoneName,
}: {
  buffer: Buffer
  mimeType: string
  path: string
  timeout?: number
} & BunnyStorageS3Credentials): Promise<void> => {
  try {
    await createS3Client({ apiKey, s3, zoneName }, timeout ?? TIMEOUTS.UPLOAD).putAnyObject(path, buffer, mimeType)
  } catch (err) {
    throw new Error(`Unable to upload file: ${path}`, { cause: err })
  }
}

export const deleteStorageFileS3 = async ({
  apiKey,
  path,
  s3,
  zoneName,
}: { path: string } & BunnyStorageS3Credentials): Promise<void> => {
  try {
    const deleted = await createS3Client({ apiKey, s3, zoneName }, TIMEOUTS.DEFAULT).deleteObject(path)
    if (!deleted) {
      throw new Error('Bunny Storage (S3): Delete failed')
    }
  } catch (err) {
    throw new Error(`Unable to delete file: ${path}`, { cause: err })
  }
}

export const presignStoragePutUrl = ({
  apiKey,
  expiresIn,
  path,
  s3,
  zoneName,
}: {
  expiresIn?: number
  path: string
} & BunnyStorageS3Credentials): Promise<string> =>
  createS3Client({ apiKey, s3, zoneName }).getPresignedUrl('PUT', path, expiresIn ?? 600)
