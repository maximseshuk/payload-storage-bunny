import type { PayloadRequest } from 'payload'
import { Forbidden } from 'payload'
import { createClientUploadReceipt, verifyClientUploadReceipt } from 'payload/internal'

type ClientUploadClaims = {
  filesize?: number
  head?: string
  mimeType?: string
  videoId?: string
}

export type VerifiedClientUpload = { prefix: string } & ClientUploadClaims

type SignClientUploadArgs = {
  claims: ClientUploadClaims
  collectionSlug: string
  filename: string
  prefix: string
  req: PayloadRequest
}

// Payload keeps only `_objectKey`, `prefix` and `signedReceipt` of a verified reference, so the
// claims ride inside the signed receipt's otherwise unused `storageFilePath`.
export const signClientUpload = ({ claims, collectionSlug, filename, prefix, req }: SignClientUploadArgs): string =>
  createClientUploadReceipt({
    collectionSlug,
    filename,
    filePrefix: prefix,
    req,
    storageFilePath: JSON.stringify(claims),
  })

type ReadClientUploadArgs = {
  collectionSlug: string
  filename: string
  req: PayloadRequest
  uploadReference: unknown
}

export const readClientUpload = ({
  collectionSlug,
  filename,
  req,
  uploadReference,
}: ReadClientUploadArgs): undefined | VerifiedClientUpload => {
  if (uploadReference === undefined || uploadReference === null) {
    return undefined
  }
  try {
    const receipt = verifyClientUploadReceipt({
      collectionSlug,
      filename,
      req,
      signedReceipt: (uploadReference as { signedReceipt?: unknown }).signedReceipt as string,
    })
    const claims: unknown = JSON.parse(receipt.storageFilePath)
    const { filesize, head, mimeType, videoId } = (
      typeof claims === 'object' && claims !== null ? claims : {}
    ) as Record<keyof ClientUploadClaims, unknown>
    return {
      prefix: receipt.filePrefix,
      ...(typeof filesize === 'number' && { filesize }),
      ...(typeof head === 'string' && { head }),
      ...(typeof mimeType === 'string' && { mimeType }),
      ...(typeof videoId === 'string' && videoId && { videoId }),
    }
  } catch {
    throw new Forbidden(req.t)
  }
}
