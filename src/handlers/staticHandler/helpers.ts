import type { NormalizedSignedUrlsConfig } from '@/types/index.js'
import type { CollectionConfig } from 'payload'

import { generateSignedUrl } from '@/utils/index.js'

type SignedUrlContext = {
  collection: CollectionConfig
  filename: string
  signedUrls: false | NormalizedSignedUrlsConfig
  tokenSecurityKey?: string
}

export function maybeGenerateSignedUrl(
  baseUrl: string,
  context: SignedUrlContext,
  options?: Parameters<typeof generateSignedUrl>[3],
): string {
  const { collection, filename, signedUrls, tokenSecurityKey } = context

  if (!signedUrls || !tokenSecurityKey) {
    return baseUrl
  }

  const shouldSign = signedUrls.shouldUseSignedUrl
    ? signedUrls.shouldUseSignedUrl({ collection, filename })
    : true

  if (!shouldSign) {
    return baseUrl
  }

  return generateSignedUrl(baseUrl, tokenSecurityKey, signedUrls, options)
}

export function maybeCreateRedirect(
  baseUrl: string,
  context: { usePayloadAccessControl: boolean } & SignedUrlContext,
  options?: Parameters<typeof generateSignedUrl>[3],
): null | Response {
  const { signedUrls, tokenSecurityKey, usePayloadAccessControl } = context

  if (!usePayloadAccessControl || !signedUrls || !tokenSecurityKey) {
    return null
  }

  if (!signedUrls.staticHandler?.useRedirect) {
    return null
  }

  const shouldSign = signedUrls.shouldUseSignedUrl
    ? signedUrls.shouldUseSignedUrl({ collection: context.collection, filename: context.filename })
    : true

  if (!shouldSign) {
    return null
  }

  const redirectConfig = {
    ...signedUrls,
    expiresIn: signedUrls.staticHandler.expiresIn ?? signedUrls.expiresIn,
  }

  const signedUrl = generateSignedUrl(baseUrl, tokenSecurityKey, redirectConfig, options)

  return new Response(null, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Location': signedUrl,
    },
    status: signedUrls.staticHandler.redirectStatus,
  })
}

export function copyHeaders(from: Headers): Headers {
  const headers = new Headers()
  from.forEach((value, key) => headers.set(key, value))
  return headers
}

export function createProxyResponse(
  response: Response,
  options?: {
    additionalHeaders?: Record<string, string>
    status?: number
  },
): Response {
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
