import { createHash } from 'crypto'

import type { CollectionConfig } from 'payload'

import type { NormalizedSignedUrlsConfig, SignedUrlsConfig } from '@/types/index.js'

const formatQueryParams = (params: Record<string, string>): string => {
  const entries = Object.entries(params)

  if (entries.length <= 1) {
    return entries[0] ? `${entries[0][0]}=${entries[0][1]}` : ''
  }

  return entries
    .toSorted((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
}

export const generateSignedToken = (
  securityKey: string,
  signedUrl: string,
  expiration: number,
  queryParams?: string,
): string => {
  if (!securityKey || !signedUrl || !expiration || expiration <= 0) {
    throw new Error('Security key, signed URL, and expiration time are required')
  }

  let hashableString = securityKey + signedUrl + expiration.toString()

  if (queryParams) {
    hashableString += queryParams
  }

  const hash = createHash('sha256').update(hashableString).digest()

  let token = hash.toString('base64')

  token = token.replace(/[\n+/=]/g, (char) => {
    switch (char) {
      case '\n':
        return ''
      case '+':
        return '-'
      case '/':
        return '_'
      case '=':
        return ''
      default:
        return char
    }
  })

  return token
}

export const generateSignedUrl = (
  baseUrl: string,
  securityKey: string,
  config: Exclude<SignedUrlsConfig, boolean>,
  options?: {
    tokenPath?: string
  },
): string => {
  if (!baseUrl || !securityKey || !config) {
    throw new Error('Base URL, security key, and configuration are required')
  }

  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    throw new Error('Invalid URL format')
  }

  const url = new URL(baseUrl)
  const expiresIn = config.expiresIn || 7200
  const expiration = Math.floor(Date.now() / 1000) + expiresIn

  const signedQueryParams: Record<string, string> = {}

  if (config.allowedCountries?.length) {
    signedQueryParams.token_countries = config.allowedCountries.join(',')
  }

  if (config.blockedCountries?.length) {
    signedQueryParams.token_countries_blocked = config.blockedCountries.join(',')
  }

  if (options?.tokenPath) {
    signedQueryParams.token_path = options.tokenPath
  }

  const existingParams = new URLSearchParams(url.search)
  const allParams = new URLSearchParams(existingParams)

  const allQueryParams: Record<string, string> = {}

  for (const [key, value] of existingParams.entries()) {
    allQueryParams[key] = value
  }

  Object.assign(allQueryParams, signedQueryParams)

  const formattedQueryParams = Object.keys(allQueryParams).length > 0 ? formatQueryParams(allQueryParams) : ''

  const signedUrlPath = options?.tokenPath || decodeURIComponent(url.pathname)

  const token = generateSignedToken(securityKey, signedUrlPath, expiration, formattedQueryParams)

  const usePathBased = !!options?.tokenPath

  if (usePathBased) {
    const parts: string[] = [url.protocol, '//', url.host, '/', 'bcdn_token=', token]

    if (Object.keys(signedQueryParams).length > 0) {
      for (const [key, value] of Object.entries(signedQueryParams)) {
        parts.push('&', key, '=', encodeURIComponent(value))
      }
    }

    parts.push('&expires=', expiration.toString())
    parts.push(url.pathname)

    if (existingParams.size > 0) {
      const existingParamsString = existingParams.toString()
      parts.push('?', existingParamsString)
    }

    return parts.join('')
  } else {
    for (const [key, value] of Object.entries(signedQueryParams)) {
      allParams.set(key, value)
    }
    allParams.set('token', token)
    allParams.set('expires', expiration.toString())

    return `${url.origin}${url.pathname}?${allParams.toString()}`
  }
}

type SignedUrlContext = {
  collection: CollectionConfig
  filename: string
  signedUrls: false | NormalizedSignedUrlsConfig | undefined
  tokenSecurityKey?: string
}

export const maybeGenerateSignedUrl = (
  baseUrl: string,
  context: SignedUrlContext,
  options?: Parameters<typeof generateSignedUrl>[3],
): string => {
  const { collection, filename, signedUrls, tokenSecurityKey } = context

  if (!signedUrls || !tokenSecurityKey) {
    return baseUrl
  }

  const shouldSign = signedUrls.shouldUseSignedUrl ? signedUrls.shouldUseSignedUrl({ collection, filename }) : true

  if (!shouldSign) {
    return baseUrl
  }

  return generateSignedUrl(baseUrl, tokenSecurityKey, signedUrls, options)
}

export const maybeCreateRedirect = (
  baseUrl: string,
  context: { usePayloadAccessControl: boolean } & SignedUrlContext,
  options?: Parameters<typeof generateSignedUrl>[3],
): null | Response => {
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
      Location: signedUrl,
    },
    status: signedUrls.staticHandler.redirectStatus,
  })
}
