import type { KyResponse, Options } from 'ky'
import { HTTPError } from 'ky'

import { kyClient } from '@/utils/kyClient.js'

type BunnyRequestArgs = {
  accept?: boolean
  apiKey: string
  contentType?: string
  genericError: string
  method: 'delete' | 'get' | 'post' | 'put'
  statusErrors?: Record<number, string>
  url: string
} & Pick<Options, 'body' | 'json' | 'searchParams' | 'throwHttpErrors' | 'timeout'>

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

  const options: Options = { headers, timeout }
  if (body !== undefined) options.body = body
  if (json !== undefined) options.json = json
  if (searchParams !== undefined) options.searchParams = searchParams
  if (throwHttpErrors !== undefined) options.throwHttpErrors = throwHttpErrors

  try {
    return await kyClient[method](url, options)
  } catch (err) {
    if (err instanceof HTTPError && statusErrors?.[err.response.status]) {
      throw new Error(statusErrors[err.response.status], { cause: err })
    }
    throw new Error(genericError, { cause: err })
  }
}
