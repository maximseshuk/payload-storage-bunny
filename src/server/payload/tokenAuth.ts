import { createHash } from 'crypto'

import type { CollectionConfig, PayloadRequest } from 'payload'

import { PLUGIN_KEY } from '@/shared/constants.js'
import type { ExpiresResolver, NormalizedSignedUrlsOptions, SignedUrlsCallbackArgs } from '@/shared/types/index.js'

type SigningCountryOptions = {
  allowedCountries?: string[]
  blockedCountries?: string[]
}

type SigningOptions = {
  expiresAt: number
  tokenPath?: string
  userIp?: string
}

export const MAX_EXPIRES_IN_SECONDS = 10 * 365 * 24 * 60 * 60

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

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
  userIp?: string,
): string => {
  if (!securityKey || !signedUrl || !expiration || expiration <= 0) {
    throw new Error('Security key, signed URL, and expiration time are required')
  }

  let hashableString = securityKey + signedUrl + expiration.toString()

  if (queryParams) {
    hashableString += queryParams
  }

  if (userIp) {
    hashableString += userIp
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
  countryOptions: SigningCountryOptions,
  options: SigningOptions,
): string => {
  if (!baseUrl || !securityKey || !countryOptions) {
    throw new Error('Base URL, security key, and country options are required')
  }

  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    throw new Error('Invalid URL format')
  }

  const url = new URL(baseUrl)
  const expiration = Math.floor(options.expiresAt)

  const signedQueryParams: Record<string, string> = {}

  if (countryOptions.allowedCountries?.length) {
    signedQueryParams.token_countries = countryOptions.allowedCountries.join(',')
  }

  if (countryOptions.blockedCountries?.length) {
    signedQueryParams.token_countries_blocked = countryOptions.blockedCountries.join(',')
  }

  if (options.tokenPath) {
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

  const signedUrlPath = options.tokenPath || decodeURIComponent(url.pathname)

  const token = generateSignedToken(securityKey, signedUrlPath, expiration, formattedQueryParams, options.userIp)

  const usePathBased = !!options.tokenPath

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
  req?: PayloadRequest
  signedUrls: false | NormalizedSignedUrlsOptions | undefined
  tokenSecurityKey?: string
}

const resolveUserIp = (signedUrls: NormalizedSignedUrlsOptions, args: SignedUrlsCallbackArgs): string | undefined => {
  if (!signedUrls.userIp || !args.req) {
    return undefined
  }

  const value = signedUrls.userIp({ ...args, req: args.req })

  if (!value) {
    return undefined
  }

  const ip = value.trim()
  const match = IPV4_PATTERN.exec(ip)

  if (!match || match.slice(1).some((octet) => Number(octet) > 255)) {
    args.req.payload?.logger?.warn({
      msg: '[bunny:storage] signed-urls: userIp returned a value that is not a valid IPv4 address, signing without IP lock',
      userIp: value,
    })
    return undefined
  }

  return ip
}

const resolveExpiresAt = (expiresIn: ExpiresResolver, key: string, args: SignedUrlsCallbackArgs): number => {
  const value = expiresIn(args)

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`[${PLUGIN_KEY}] ${key} returned an invalid Date`)
    }
    return Math.floor(value.getTime() / 1000)
  }

  if (!Number.isFinite(value) || value <= 0 || value > MAX_EXPIRES_IN_SECONDS) {
    throw new Error(
      `[${PLUGIN_KEY}] ${key} returned ${value} seconds. A number is seconds from now, more than 0 and at most 10 years; return a Date for an absolute time.`,
    )
  }

  return Math.floor(Date.now() / 1000 + value)
}

const resolveSigningOptions = (
  signedUrls: NormalizedSignedUrlsOptions,
  expiresIn: { key: string; resolve: ExpiresResolver },
  args: SignedUrlsCallbackArgs,
  options?: Partial<SigningOptions>,
): SigningOptions => ({
  ...options,
  expiresAt: options?.expiresAt ?? resolveExpiresAt(expiresIn.resolve, expiresIn.key, args),
  userIp: options?.userIp ?? resolveUserIp(signedUrls, args),
})

const signingCountryOptions = ({
  allowedCountries,
  blockedCountries,
}: NormalizedSignedUrlsOptions): SigningCountryOptions => ({
  allowedCountries,
  blockedCountries,
})

export const maybeGenerateSignedUrl = (
  baseUrl: string,
  context: SignedUrlContext,
  options?: Partial<SigningOptions>,
): string => {
  const { collection, filename, req, signedUrls, tokenSecurityKey } = context

  if (!signedUrls || !tokenSecurityKey) {
    return baseUrl
  }

  const callbackArgs: SignedUrlsCallbackArgs = { collection, filename, req }

  const shouldSign = signedUrls.shouldUseSignedUrl ? signedUrls.shouldUseSignedUrl(callbackArgs) : true

  if (!shouldSign) {
    return baseUrl
  }

  return generateSignedUrl(
    baseUrl,
    tokenSecurityKey,
    signingCountryOptions(signedUrls),
    resolveSigningOptions(
      signedUrls,
      { key: 'signedUrls.expiresIn', resolve: signedUrls.expiresIn },
      callbackArgs,
      options,
    ),
  )
}

export const maybeCreateRedirect = (
  baseUrl: string,
  context: { usePayloadAccessControl: boolean } & SignedUrlContext,
  options?: Partial<SigningOptions>,
): null | Response => {
  const { signedUrls, tokenSecurityKey, usePayloadAccessControl } = context

  if (!usePayloadAccessControl || !signedUrls || !tokenSecurityKey) {
    return null
  }

  if (!signedUrls.redirect) {
    return null
  }

  const callbackArgs: SignedUrlsCallbackArgs = {
    collection: context.collection,
    filename: context.filename,
    req: context.req,
  }

  const shouldSign = signedUrls.shouldUseSignedUrl ? signedUrls.shouldUseSignedUrl(callbackArgs) : true

  if (!shouldSign) {
    return null
  }

  const signedUrl = generateSignedUrl(
    baseUrl,
    tokenSecurityKey,
    signingCountryOptions(signedUrls),
    resolveSigningOptions(
      signedUrls,
      signedUrls.redirect.expiresIn
        ? { key: 'signedUrls.staticHandler.redirect.expiresIn', resolve: signedUrls.redirect.expiresIn }
        : { key: 'signedUrls.expiresIn', resolve: signedUrls.expiresIn },
      callbackArgs,
      options,
    ),
  )

  return new Response(null, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Location: signedUrl,
    },
    status: signedUrls.redirect.status,
  })
}
