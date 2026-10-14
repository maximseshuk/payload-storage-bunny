import type { CollectionConfig, PayloadRequest } from 'payload'

import { httpFetch } from '@/server/http/index.js'
import { maybeCreateRedirect, maybeGenerateSignedUrl } from '@/server/payload/tokenAuth.js'
import { buildStreamCdnUrl } from '@/server/urls.js'
import { copyHeaders, upstreamErrorResponse } from '@/shared/http.js'
import type { NormalizedSignedUrlsOptions, NormalizedStreamOptions } from '@/shared/types/index.js'

type Args = {
  collection: CollectionConfig
  req: PayloadRequest
  signedUrls: false | NormalizedSignedUrlsOptions
  streamOptions: NormalizedStreamOptions
  thumbnailType: 'preview.webp' | 'thumbnail.jpg'
  usePayloadAccessControl: boolean
  videoId: string
}

export const streamThumbnailStaticHandler = async ({
  collection,
  req,
  signedUrls,
  streamOptions,
  thumbnailType,
  usePayloadAccessControl,
  videoId,
}: Args): Promise<Response> => {
  let thumbnailUrl = buildStreamCdnUrl(streamOptions.hostname, videoId, thumbnailType)

  if (req.url) {
    const requestUrl = new URL(req.url, `http://${req.headers.get('host') || 'localhost'}`)
    if (requestUrl.search) {
      thumbnailUrl += requestUrl.search
    }
  }

  const context = {
    collection,
    filename: `${videoId}/${thumbnailType}`,
    signedUrls,
    tokenSecurityKey: streamOptions.tokenSecurityKey,
    usePayloadAccessControl,
  }

  const redirect = maybeCreateRedirect(thumbnailUrl, { ...context, req })
  if (redirect) {
    return redirect
  }

  try {
    const fetchUrl = maybeGenerateSignedUrl(thumbnailUrl, context)
    const headers = new Headers()
    for (const name of ['if-modified-since', 'if-none-match']) {
      const value = req.headers.get(name)
      if (value) {
        headers.set(name, value)
      }
    }
    if (streamOptions.referer) {
      headers.set('Referer', streamOptions.referer)
    }
    const response = await httpFetch(fetchUrl, { headers, stream: true, throwHttpErrors: false })

    if (response.status === 304) {
      return new Response(null, { headers: copyHeaders(response.headers), status: 304 })
    }

    if (response.status === 401 || response.status === 403) {
      return new Response(
        'The Bunny CDN refused the thumbnail request. Set `stream.referer` when the library allows only some referrers, and `stream.tokenSecurityKey` when it uses token authentication.',
        { status: 502 },
      )
    }

    if (!response.ok) {
      return upstreamErrorResponse(response)
    }

    return new Response(response.body, {
      headers: copyHeaders(response.headers),
      status: response.status,
    })
  } catch (err) {
    req.payload.logger.error({ err, msg: '[bunny:stream] thumbnail: fetch failed', thumbnailUrl })
    return new Response('Error fetching thumbnail', { status: 500 })
  }
}
