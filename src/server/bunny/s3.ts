import { S3mini, S3ServiceError } from 's3mini'

import { createStorageExistsError } from '@/server/bunny/storage.js'
import { TIMEOUTS } from '@/shared/constants.js'
import type { StorageRegion } from '@/shared/types/options.js'

export type BunnyStorageS3Credentials = {
  apiKey: string
  region: StorageRegion
  zoneName: string
}

export const getS3Endpoint = (region: string): string => `https://${region}-s3.storage.bunnycdn.com`

const createS3Client = (
  { apiKey, region, zoneName }: BunnyStorageS3Credentials,
  requestAbortTimeout?: number,
): S3mini =>
  new S3mini({
    accessKeyId: zoneName,
    endpoint: `${getS3Endpoint(region)}/${zoneName}`,
    region,
    requestAbortTimeout,
    secretAccessKey: apiKey,
  })

export const uploadStorageFileS3 = async ({
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
} & BunnyStorageS3Credentials): Promise<void> => {
  try {
    await createS3Client({ apiKey, region, zoneName }, timeout ?? TIMEOUTS.UPLOAD).putAnyObject(path, buffer, mimeType)
  } catch (err) {
    throw new Error(`Unable to upload file: ${path}`, { cause: err })
  }
}

export const copyStorageFileS3 = async ({
  apiKey,
  from,
  region,
  timeout,
  to,
  zoneName,
}: { from: string; timeout?: number; to: string } & BunnyStorageS3Credentials): Promise<void> => {
  try {
    await createS3Client({ apiKey, region, zoneName }, timeout ?? TIMEOUTS.UPLOAD).copyObject(from, to, {
      additionalHeaders: { 'If-None-Match': '*' },
      metadataDirective: 'COPY',
    })
  } catch (err) {
    if (err instanceof S3ServiceError && err.status === 412) {
      throw createStorageExistsError()
    }
    throw new Error(`Unable to copy file: ${from}`, { cause: err })
  }
}

export const deleteStorageFileS3 = async ({
  apiKey,
  path,
  region,
  zoneName,
}: { path: string } & BunnyStorageS3Credentials): Promise<void> => {
  try {
    const deleted = await createS3Client({ apiKey, region, zoneName }, TIMEOUTS.DEFAULT).deleteObject(path)
    if (!deleted) {
      throw new Error('Bunny Storage (S3): Delete failed')
    }
  } catch (err) {
    throw new Error(`Unable to delete file: ${path}`, { cause: err })
  }
}

export const presignStoragePutUrl = ({
  apiKey,
  contentLength,
  contentType,
  expiresIn,
  path,
  region,
  zoneName,
}: {
  contentLength: number
  contentType: string
  expiresIn?: number
  path: string
} & BunnyStorageS3Credentials): Promise<string> =>
  createS3Client({ apiKey, region, zoneName }).getPresignedUrl(
    'PUT',
    path,
    expiresIn ?? 600,
    {},
    { 'Content-Length': String(contentLength), 'Content-Type': contentType, 'If-None-Match': '*' },
  )
