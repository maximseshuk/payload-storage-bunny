import { createHash, createHmac, timingSafeEqual } from 'crypto'

import type { PayloadRequest } from 'payload'

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

const STREAM_VIDEO_TOKEN_TTL_SECONDS = 24 * 60 * 60
const STREAM_VIDEO_TOKEN_PATTERN = /^(\d+)\.([\da-f]{64})$/

type StreamVideoTokenInput = {
  collection: string
  libraryId: number
  secret: string
  user: PayloadRequest['user']
  videoId: string
}

const digestStreamVideoToken = (
  { collection, libraryId, secret, user, videoId }: StreamVideoTokenInput,
  expiresAt: number,
): string => {
  const userKey = user ? `${user.collection}:${user.id}` : ''
  return createHmac('sha256', secret)
    .update(`stream-video:${collection}:${libraryId}:${videoId}:${userKey}:${expiresAt}`)
    .digest('hex')
}

export const signStreamVideoToken = (input: StreamVideoTokenInput): string => {
  const expiresAt = Math.floor(Date.now() / 1000) + STREAM_VIDEO_TOKEN_TTL_SECONDS
  return `${expiresAt}.${digestStreamVideoToken(input, expiresAt)}`
}

export const verifyStreamVideoToken = ({ token, ...input }: StreamVideoTokenInput & { token: unknown }): boolean => {
  const match = typeof token === 'string' ? STREAM_VIDEO_TOKEN_PATTERN.exec(token) : null
  if (!match || !input.videoId || !input.secret) {
    return false
  }
  const expiresAt = Number(match[1])
  if (expiresAt * 1000 <= Date.now()) {
    return false
  }
  const expected = Buffer.from(digestStreamVideoToken(input, expiresAt))
  const actual = Buffer.from(match[2])
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
