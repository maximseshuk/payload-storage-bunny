import ky, { HTTPError, type KyResponse, type Options } from 'ky'

export { HTTPError }
export type { KyResponse }

export type HttpMethod = 'delete' | 'get' | 'head' | 'options' | 'post' | 'put'

export type HttpOptions = Pick<
  Options,
  'body' | 'headers' | 'json' | 'retry' | 'searchParams' | 'signal' | 'throwHttpErrors' | 'timeout'
> & {
  method?: HttpMethod
  stream?: boolean
}

const client = ky.create({
  hooks: {
    afterResponse: [
      ({ options, response }) => {
        if (!options.context.stream) void response.blob()
      },
    ],
  },
  retry: 0,
  timeout: false,
})

export const httpFetch = (url: string, { method = 'get', stream, ...rest }: HttpOptions = {}): Promise<KyResponse> => {
  const options = stream ? { ...rest, context: { stream: true } } : rest
  return method === 'options' ? client(url, { ...options, method: 'OPTIONS' }) : client[method](url, options)
}

export const httpJson = async <T>(url: string, options?: HttpOptions): Promise<T> =>
  (await httpFetch(url, options)).json<T>()

export const httpSend = async (url: string, options?: HttpOptions): Promise<void> => {
  await httpFetch(url, options)
}
