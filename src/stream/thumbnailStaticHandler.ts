import { HTTPError } from 'ky'
import type { CollectionConfig, PayloadRequest } from 'payload'

import { maybeCreateRedirect, maybeGenerateSignedUrl } from '@/cdn/tokenAuth.js'
import type { NormalizedSignedUrlsConfig, NormalizedStreamConfig } from '@/types/index.js'
import { buildStreamCdnUrl } from '@/utils/cdnUrl.js'
import { copyHeaders } from '@/utils/http.js'
import { kyClient } from '@/utils/kyClient.js'

type Args = {
  collection: CollectionConfig
  req: PayloadRequest
  signedUrls: false | NormalizedSignedUrlsConfig
  streamConfig: NormalizedStreamConfig
  thumbnailType: 'preview.webp' | 'thumbnail.jpg'
  usePayloadAccessControl: boolean
  videoId: string
}

export const streamThumbnailStaticHandler = async ({
  collection,
  req,
  signedUrls,
  streamConfig,
  thumbnailType,
  usePayloadAccessControl,
  videoId,
}: Args): Promise<Response> => {
  let thumbnailUrl = buildStreamCdnUrl(streamConfig.hostname, videoId, thumbnailType)

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
    tokenSecurityKey: streamConfig.tokenSecurityKey,
    usePayloadAccessControl,
  }

  const redirect = maybeCreateRedirect(thumbnailUrl, { ...context, req })
  if (redirect) {
    return redirect
  }

  try {
    const fetchUrl = maybeGenerateSignedUrl(thumbnailUrl, context)
    const response = await kyClient.get(fetchUrl)

    return new Response(response.body, {
      headers: copyHeaders(response.headers),
      status: response.status,
    })
  } catch (err) {
    if (err instanceof HTTPError) {
      return new Response('Thumbnail not found', { status: err.response.status })
    }

    req.payload.logger.error({ err, msg: '[bunny:stream] thumbnail: fetch failed', thumbnailUrl })
    return new Response('Error fetching thumbnail', { status: 500 })
  }
}
