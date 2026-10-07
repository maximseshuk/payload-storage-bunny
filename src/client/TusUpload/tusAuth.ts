import ky from 'ky'
import type { DetailedError, HttpRequest } from 'tus-js-client'

import type { StreamTusAuthRequest, StreamTusAuthResponse } from '@/shared/types/index.js'

const RENEW_MARGIN_MS = 60_000
const RETRY_CLIENT_STATUSES = [409, 423]

export type TusAuthResponse = { requestedAt: number } & StreamTusAuthResponse

type TusAuthUploaded = Extract<TusAuthResponse, { type: 'uploaded' }>

export class TusRenewError extends Error {
  uploaded?: TusAuthUploaded

  constructor(uploaded?: TusAuthUploaded) {
    super(
      uploaded
        ? 'tus: the upload has already finished'
        : 'tus: the server did not renew the authorization of this upload',
    )
    this.name = 'TusRenewError'
    this.uploaded = uploaded
  }
}

const getRenewError = (err: Error): TusRenewError | undefined => {
  const cause = (err as Partial<DetailedError>).causingError
  return cause instanceof TusRenewError ? cause : undefined
}

export const getTusAuthUrl = (serverURL: string, apiRoute: string): string =>
  `${serverURL}${apiRoute}/storage-bunny/stream/tus-auth`

export const requestTusAuth = async (url: string, body: StreamTusAuthRequest): Promise<TusAuthResponse> => {
  const requestedAt = Date.now()
  return { ...(await ky.post(url, { json: body }).json<StreamTusAuthResponse>()), requestedAt }
}

export const getFinishedTusUpload = (err: Error): TusAuthUploaded | undefined => getRenewError(err)?.uploaded

export const isLostTusUpload = (err: Error): boolean => {
  const renewError = getRenewError(err)
  return renewError ? !renewError.uploaded : (err as Partial<DetailedError>).originalResponse?.getStatus() === 404
}

export const shouldRetryTusRequest = (err: DetailedError): boolean => {
  if (getRenewError(err)) {
    return false
  }
  const status = err.originalResponse?.getStatus() ?? 0
  return status < 400 || status >= 500 || RETRY_CLIENT_STATUSES.includes(status)
}

export const renewTusHeaders = ({
  auth,
  body,
  url,
}: {
  auth: { expiresIn: number; headers: Record<string, string>; requestedAt?: number; uploadUrl: string }
  body: StreamTusAuthRequest
  url: string
}): ((req: HttpRequest) => Promise<void>) => {
  let headers = auth.headers
  let expiresAt = (auth.requestedAt ?? Date.now()) + auth.expiresIn * 1000
  return async (req) => {
    if (expiresAt - Date.now() < RENEW_MARGIN_MS) {
      let next: TusAuthResponse
      try {
        next = await requestTusAuth(url, { ...body, renew: true })
      } catch {
        throw new TusRenewError()
      }
      if (next.type === 'uploaded') {
        throw new TusRenewError(next)
      }
      if (next.uploadUrl !== auth.uploadUrl) {
        throw new TusRenewError()
      }
      headers = next.headers
      expiresAt = next.requestedAt + next.expiresIn * 1000
    }
    for (const [name, value] of Object.entries(headers)) {
      req.setHeader(name, value)
    }
  }
}
