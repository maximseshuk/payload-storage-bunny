import { createHash, createHmac, timingSafeEqual } from 'crypto'

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

type StreamVideoTokenInput = {
  collection: string
  libraryId: number
  secret: string
  videoId: string
}

export const signStreamVideoToken = ({ collection, libraryId, secret, videoId }: StreamVideoTokenInput): string =>
  createHmac('sha256', secret).update(`stream-video:${collection}:${libraryId}:${videoId}`).digest('hex')

export const verifyStreamVideoToken = ({ token, ...input }: StreamVideoTokenInput & { token: unknown }): boolean => {
  if (typeof token !== 'string' || !token || !input.videoId || !input.secret) {
    return false
  }
  const expected = Buffer.from(signStreamVideoToken(input))
  const actual = Buffer.from(token)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
