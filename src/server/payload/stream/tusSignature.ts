import { createHash } from 'crypto'

export const generateStreamTusUploadSignature = ({
  apiKey,
  expirationTime,
  libraryId,
  videoId,
}: {
  apiKey: string
  expirationTime: number
  libraryId: number
  videoId: string
}): string => {
  if (!libraryId || !apiKey || !expirationTime || !videoId) {
    throw new Error('Library ID, API key, expiration time, and video ID are required')
  }
  const data = `${libraryId}${apiKey}${expirationTime}${videoId}`
  return createHash('sha256').update(data).digest('hex')
}
