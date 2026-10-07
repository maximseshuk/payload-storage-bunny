import { HTTPError, httpFetch, type HttpOptions, type KyResponse } from '@/server/http/index.js'

const hasStatus = (err: unknown, status: number): boolean =>
  err instanceof Error && err.cause instanceof HTTPError && err.cause.response.status === status

export const isRateLimited = (err: unknown): boolean => hasStatus(err, 429)

export const isNotFound = (err: unknown): boolean => hasStatus(err, 404)

export const isClientError = (err: unknown): boolean =>
  err instanceof Error && err.cause instanceof HTTPError && err.cause.response.status < 500 && !isRateLimited(err)

type BunnyRequestArgs = {
  accept?: boolean
  apiKey: string
  contentType?: string
  genericError: string
  headers?: Record<string, string>
  method: 'delete' | 'get' | 'post' | 'put'
  statusErrors?: Record<number, string>
  url: string
} & Pick<HttpOptions, 'body' | 'json' | 'searchParams' | 'stream' | 'throwHttpErrors' | 'timeout'>

export const bunnyRequest = async ({
  accept = true,
  apiKey,
  body,
  contentType,
  genericError,
  headers: extraHeaders,
  json,
  method,
  searchParams,
  statusErrors,
  stream,
  throwHttpErrors,
  timeout,
  url,
}: BunnyRequestArgs): Promise<KyResponse> => {
  const headers: Record<string, string> = { ...extraHeaders, AccessKey: apiKey }
  if (accept) headers.Accept = 'application/json'
  if (contentType) headers['Content-Type'] = contentType

  const options: HttpOptions = { headers, method, stream, timeout }
  if (body !== undefined) options.body = body
  if (json !== undefined) options.json = json
  if (searchParams !== undefined) options.searchParams = searchParams
  if (throwHttpErrors !== undefined) options.throwHttpErrors = throwHttpErrors

  try {
    return await httpFetch(url, options)
  } catch (err) {
    if (err instanceof HTTPError && statusErrors?.[err.response.status]) {
      throw new Error(statusErrors[err.response.status], { cause: err })
    }
    throw new Error(genericError, { cause: err })
  }
}
