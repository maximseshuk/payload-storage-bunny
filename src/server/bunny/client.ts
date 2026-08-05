import { HTTPError, httpFetch, type HttpOptions, type KyResponse } from '@/server/http/index.js'

type BunnyRequestArgs = {
  accept?: boolean
  apiKey: string
  contentType?: string
  genericError: string
  method: 'delete' | 'get' | 'post' | 'put'
  statusErrors?: Record<number, string>
  url: string
} & Pick<HttpOptions, 'body' | 'json' | 'searchParams' | 'throwHttpErrors' | 'timeout'>

export const bunnyRequest = async ({
  accept = true,
  apiKey,
  body,
  contentType,
  genericError,
  json,
  method,
  searchParams,
  statusErrors,
  throwHttpErrors,
  timeout,
  url,
}: BunnyRequestArgs): Promise<KyResponse> => {
  const headers: Record<string, string> = { AccessKey: apiKey }
  if (accept) headers.Accept = 'application/json'
  if (contentType) headers['Content-Type'] = contentType

  const options: HttpOptions = { headers, method, timeout }
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
