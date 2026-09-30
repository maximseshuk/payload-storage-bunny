export const copyHeaders = (from: Headers): Headers => {
  const headers = new Headers()
  from.forEach((value, key) => headers.set(key, value))
  return headers
}

export const jsonResponse = <T>(data: T, status = 200): Response => {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

export const trimTrailingSlashes = (value: string): string => {
  let end = value.length
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end--
  }
  return value.slice(0, end)
}

export const createProxyResponse = (
  response: Response,
  options?: {
    additionalHeaders?: Record<string, string>
    status?: number
  },
): Response => {
  const headers = copyHeaders(response.headers)

  if (options?.additionalHeaders) {
    Object.entries(options.additionalHeaders).forEach(([key, value]) => {
      headers.set(key, value)
    })
  }

  return new Response(response.body, {
    headers,
    status: options?.status ?? response.status,
  })
}
