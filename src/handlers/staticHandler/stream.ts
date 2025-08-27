import type { BunnyStreamVideoDocumentMeta, NormalizedSignedUrlsConfig, NormalizedStreamConfig } from '@/types/index.js'
import type { CollectionConfig, PayloadRequest } from 'payload'

import { getStreamVideoResolutions } from '@/utils/client/stream.js'

import { createProxyResponse, maybeCreateRedirect, maybeGenerateSignedUrl } from './helpers.js'

type Args = {
  collection: CollectionConfig
  docId: number | string
  req: PayloadRequest
  signedUrls: false | NormalizedSignedUrlsConfig
  streamConfig: NormalizedStreamConfig
  usePayloadAccessControl: boolean
  videoId: string
  videoMeta: BunnyStreamVideoDocumentMeta | null
}

export const streamStaticHandler = async ({
  collection,
  docId,
  req,
  signedUrls,
  streamConfig,
  usePayloadAccessControl,
  videoId,
  videoMeta,
}: Args): Promise<Response> => {
  if (!streamConfig.mp4Fallback) {
    return new Response('MP4 fallback not configured.', { status: 400 })
  }

  const context = {
    collection,
    filename: '', // Will be set per request
    signedUrls,
    tokenSecurityKey: streamConfig.tokenSecurityKey,
    usePayloadAccessControl,
  }

  let fallbackQuality: string | undefined = undefined
  let availableResolutions: string[] = []
  let metaNeedsUpdate = false

  // Check saved resolution
  if (videoMeta?.highestMp4Resolution) {
    const savedResolutionUrl = `https://${streamConfig.hostname}/${videoId}/play_${videoMeta.highestMp4Resolution}.mp4`
    const checkContext = { ...context, filename: `${videoId}/play_${videoMeta.highestMp4Resolution}.mp4` }

    try {
      const checkUrl = maybeGenerateSignedUrl(savedResolutionUrl, checkContext)
      const headResponse = await fetch(checkUrl, {
        headers: { 'Accept': 'video/mp4' },
        method: 'HEAD',
      })

      if (headResponse.ok) {
        fallbackQuality = videoMeta.highestMp4Resolution
        if (videoMeta.availableMp4Resolutions && videoMeta.availableMp4Resolutions.length > 0) {
          availableResolutions = videoMeta.availableMp4Resolutions
        }
      } else {
        metaNeedsUpdate = true
      }
    } catch (err) {
      req.payload.logger.error({ err, msg: 'Error checking saved resolution' })
      metaNeedsUpdate = true
    }
  } else {
    metaNeedsUpdate = true
  }

  // Find available resolution if needed
  if (!fallbackQuality) {
    try {
      const resolutionsData = await getStreamVideoResolutions({ streamConfig, videoId })

      if (
        resolutionsData.success &&
        resolutionsData.data.mp4Resolutions &&
        resolutionsData.data.mp4Resolutions.length > 0
      ) {
        availableResolutions = resolutionsData.data.mp4Resolutions
          ?.map((r) => r.resolution)
          .filter((resolution): resolution is string => Boolean(resolution)) || []

        if (availableResolutions.length > 0) {
          const sortedResolutions = [...availableResolutions].sort((a, b) =>
            parseInt(b.replace('p', '')) - parseInt(a.replace('p', '')),
          )

          for (const resolution of sortedResolutions) {
            const baseCheckUrl = `https://${streamConfig.hostname}/${videoId}/play_${resolution}.mp4`
            const checkContext = { ...context, filename: `${videoId}/play_${resolution}.mp4` }
            const checkUrl = maybeGenerateSignedUrl(baseCheckUrl, checkContext)

            try {
              const headResponse = await fetch(checkUrl, {
                headers: { 'Accept': 'video/mp4' },
                method: 'HEAD',
              })

              if (headResponse.ok) {
                fallbackQuality = resolution
                break
              }
            } catch (err) {
              req.payload.logger.error({ err, msg: `Error checking resolution ${resolution}` })
            }
          }

          if (fallbackQuality) {
            metaNeedsUpdate = !videoMeta?.highestMp4Resolution ||
                             videoMeta.highestMp4Resolution !== fallbackQuality
          }
        }
      } else {
        req.payload.logger.error('No MP4 resolutions available from Bunny API')
      }
    } catch (err) {
      req.payload.logger.error({ err, msg: 'Error fetching available resolutions' })
    }
  }

  if (!fallbackQuality) {
    return new Response('Could not determine a valid resolution for the video', { status: 404 })
  }

  // Update metadata if needed
  if (metaNeedsUpdate && fallbackQuality && docId && collection) {
    try {
      await req.payload.update({
        id: docId,
        collection: collection.slug,
        data: {
          bunnyVideoMeta: {
            availableMp4Resolutions: availableResolutions.length > 0 ? availableResolutions : undefined,
            highestMp4Resolution: fallbackQuality,
          },
        },
      })
    } catch (err) {
      req.payload.logger.error({ err, msg: 'Failed to update bunnyVideoMeta' })
    }
  }

  const mp4Url = `https://${streamConfig.hostname}/${videoId}/play_${fallbackQuality}.mp4`
  const finalContext = { ...context, filename: `${videoId}/play_${fallbackQuality}.mp4` }

  const tokenPath = `/${videoId}/`

  // Check if we should redirect to signed URL
  const redirect = maybeCreateRedirect(mp4Url, finalContext, {
    tokenPath,
  })
  if (redirect) {
    return redirect
  }

  // Proxy the content
  const rangeHeader = req.headers.get('range')
  const requestHeaders = new Headers()
  if (rangeHeader) {
    requestHeaders.set('Range', rangeHeader)
  }

  const fetchUrl = maybeGenerateSignedUrl(mp4Url, finalContext, {
    tokenPath,
  })

  const response = await fetch(fetchUrl, {
    headers: requestHeaders,
  })

  if (!response.ok && response.status !== 206) {
    return new Response(null, { status: 404, statusText: 'Not Found' })
  }

  return createProxyResponse(response, {
    additionalHeaders: !response.headers.has('content-type')
      ? { 'content-type': 'video/mp4' }
      : undefined,
  })
}
