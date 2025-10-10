import type { NormalizedSignedUrlsConfig, NormalizedStreamConfig } from '@/types/index.js'
import type { CollectionConfig, PayloadRequest } from 'payload'

import { kyClient } from '@/utils/index.js'
import { HTTPError } from 'ky'

import { copyHeaders, maybeCreateRedirect, maybeGenerateSignedUrl } from './helpers.js'

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
  const thumbnailUrl = `https://${streamConfig.hostname}/${videoId}/${thumbnailType}`
  const context = {
    collection,
    filename: `${videoId}/${thumbnailType}`,
    signedUrls,
    tokenSecurityKey: streamConfig.tokenSecurityKey,
    usePayloadAccessControl,
  }

  const redirect = maybeCreateRedirect(thumbnailUrl, context)
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

    req.payload.logger.error({ err, thumbnailUrl })
    return new Response('Error fetching thumbnail', { status: 500 })
  }
}
