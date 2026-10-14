import type { CollectionConfig, FileHandlerOperation, PayloadRequest } from 'payload'

import { httpFetch } from '@/server/http/index.js'
import { maybeCreateRedirect, maybeGenerateSignedUrl } from '@/server/payload/tokenAuth.js'
import { buildStorageCdnUrl } from '@/server/urls.js'
import { copyHeaders, createProxyResponse, upstreamErrorResponse } from '@/shared/http.js'
import type { NormalizedSignedUrlsOptions, NormalizedStorageOptions } from '@/shared/types/index.js'

type Args = {
  collection: CollectionConfig
  collectionPrefix?: string
  filename: string
  operation?: FileHandlerOperation
  prefix?: string
  req: PayloadRequest
  signedUrls: false | NormalizedSignedUrlsOptions
  storageOptions: NormalizedStorageOptions
  usePayloadAccessControl: boolean
}

export const storageStaticHandler = async ({
  collection,
  collectionPrefix,
  filename,
  operation,
  prefix,
  req,
  signedUrls,
  storageOptions,
  usePayloadAccessControl,
}: Args): Promise<Response> => {
  let baseUrl = buildStorageCdnUrl({ collectionPrefix, filename, hostname: storageOptions.hostname, prefix })

  const isTransformSource = operation === 'transform'

  if (req.url && !isTransformSource) {
    const requestUrl = new URL(req.url, `http://${req.headers.get('host') || 'localhost'}`)
    requestUrl.searchParams.delete('prefix')
    const forwardedSearch = requestUrl.searchParams.toString()
    if (forwardedSearch) {
      baseUrl += `?${forwardedSearch}`
    }
  }

  const context = {
    collection,
    filename,
    signedUrls,
    tokenSecurityKey: storageOptions.tokenSecurityKey,
    usePayloadAccessControl,
  }

  const redirect = isTransformSource ? null : maybeCreateRedirect(baseUrl, { ...context, req })
  if (redirect) {
    return redirect
  }

  const rangeHeader = isTransformSource ? null : req.headers.get('range')
  const requestHeaders = new Headers()
  if (rangeHeader) {
    requestHeaders.set('Range', rangeHeader)
  }

  const fetchUrl = maybeGenerateSignedUrl(baseUrl, context)

  const response = await httpFetch(fetchUrl, {
    headers: requestHeaders,
    stream: true,
    throwHttpErrors: false,
  })

  if (!response.ok) {
    return upstreamErrorResponse(response)
  }

  const etagFromHeaders = req.headers.get('etag') || req.headers.get('if-none-match')
  const objectEtag = response.headers.get('etag')

  if (!isTransformSource && etagFromHeaders && objectEtag && etagFromHeaders === objectEtag) {
    response.body?.cancel().catch(() => {})
    return new Response(null, {
      headers: copyHeaders(response.headers),
      status: 304,
    })
  }

  return createProxyResponse(response)
}
