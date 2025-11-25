import type { NormalizedSignedUrlsConfig, NormalizedStorageConfig } from '@/types/index.js'
import type { CollectionConfig, PayloadRequest } from 'payload'

import { posix } from 'node:path'

import { copyHeaders, createProxyResponse, maybeCreateRedirect, maybeGenerateSignedUrl } from './helpers.js'

type Args = {
  collection: CollectionConfig
  filename: string
  prefix?: string
  req: PayloadRequest
  signedUrls: false | NormalizedSignedUrlsConfig
  storageConfig: NormalizedStorageConfig
  usePayloadAccessControl: boolean
}

export const storageStaticHandler = async ({
  collection,
  filename,
  prefix,
  req,
  signedUrls,
  storageConfig,
  usePayloadAccessControl,
}: Args): Promise<Response> => {
  let baseUrl = `https://${storageConfig.hostname}/${posix.join(prefix || '', filename)}`

  if (req.url) {
    const requestUrl = new URL(req.url, `http://${req.headers.get('host') || 'localhost'}`)
    if (requestUrl.search) {
      baseUrl += requestUrl.search
    }
  }

  const context = {
    collection,
    filename,
    signedUrls,
    tokenSecurityKey: storageConfig.tokenSecurityKey,
    usePayloadAccessControl,
  }

  const redirect = maybeCreateRedirect(baseUrl, context)
  if (redirect) {
    return redirect
  }

  const rangeHeader = req.headers.get('range')
  const requestHeaders = new Headers()
  if (rangeHeader) {
    requestHeaders.set('Range', rangeHeader)
  }

  const fetchUrl = maybeGenerateSignedUrl(baseUrl, context)

  const response = await fetch(fetchUrl, {
    headers: requestHeaders,
  })

  if (!response.ok && response.status !== 206) {
    return new Response(null, { status: 404, statusText: 'Not Found' })
  }

  const etagFromHeaders = req.headers.get('etag') || req.headers.get('if-none-match')
  const objectEtag = response.headers.get('etag')

  if (etagFromHeaders && objectEtag && etagFromHeaders === objectEtag) {
    return new Response(null, {
      headers: copyHeaders(response.headers),
      status: 304,
    })
  }

  return createProxyResponse(response)
}
