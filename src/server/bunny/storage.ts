import { bunnyRequest, isNotFound } from '@/server/bunny/client.js'
import { getStorageUrl, TIMEOUTS } from '@/shared/constants.js'

export type BunnyStorageCredentials = {
  apiKey: string
  region?: string
  zoneName: string
}

export const createStorageExistsError = (): Error =>
  Object.assign(new Error('Storage destination already exists'), { code: 'EEXIST' })

export const deleteStorageFile = async ({
  apiKey,
  path,
  region,
  zoneName,
}: { path: string } & BunnyStorageCredentials): Promise<void> => {
  try {
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
  } catch (err) {
    if (!isNotFound(err)) {
      throw err
    }
  }
}

export const storageFileExists = async ({
  apiKey,
  path,
  region,
  zoneName,
}: { path: string } & BunnyStorageCredentials): Promise<boolean> => {
  const response = await bunnyRequest({
    accept: false,
    apiKey,
    genericError: `Unable to read file: ${path}`,
    headers: { Range: 'bytes=0-0' },
    method: 'get',
    throwHttpErrors: false,
    timeout: TIMEOUTS.DEFAULT,
    url: `${getStorageUrl(region)}/${zoneName}/${path}`,
  })
  if (response.ok) {
    return true
  }
  if (response.status === 404) {
    return false
  }
  throw new Error(`Unable to read file: ${path} (${response.status})`)
}

export const copyStorageFile = async ({
  apiKey,
  from,
  region,
  timeout,
  to,
  zoneName,
}: { from: string; timeout?: number; to: string } & BunnyStorageCredentials): Promise<void> => {
  if (await storageFileExists({ apiKey, path: to, region, zoneName })) {
    throw createStorageExistsError()
  }
  const source = await bunnyRequest({
    accept: false,
    apiKey,
    genericError: `Unable to read file: ${from}`,
    method: 'get',
    stream: true,
    timeout: timeout ?? TIMEOUTS.UPLOAD,
    url: `${getStorageUrl(region)}/${zoneName}/${from}`,
  })
  await bunnyRequest({
    apiKey,
    body: source.body,
    contentType: source.headers.get('content-type') ?? undefined,
    genericError: `Unable to upload file: ${to}`,
    method: 'put',
    statusErrors: {
      400: 'Bunny Storage: Upload failed',
      401: 'Bunny Storage: Invalid access key, region, or file format',
    },
    timeout: timeout ?? TIMEOUTS.UPLOAD,
    url: `${getStorageUrl(region)}/${zoneName}/${to}`,
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
