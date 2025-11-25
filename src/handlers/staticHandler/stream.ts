import type { BunnyDataInternal } from '@/types/core.js'
import type { NormalizedSignedUrlsConfig, NormalizedStreamConfig } from '@/types/index.js'
import type { CollectionConfig, PayloadRequest } from 'payload'

import { getStreamVideoResolutions } from '@/utils/client/stream.js'

import { createProxyResponse, maybeCreateRedirect, maybeGenerateSignedUrl } from './helpers.js'

type Args = {
  bunnyData: BunnyDataInternal
  collection: CollectionConfig
  docId: number | string
  req: PayloadRequest
  signedUrls: false | NormalizedSignedUrlsConfig
  streamConfig: NormalizedStreamConfig
  usePayloadAccessControl: boolean
}

export const streamStaticHandler = async ({
  bunnyData,
  collection,
  docId,
  req,
  signedUrls,
  streamConfig,
  usePayloadAccessControl,
}: Args): Promise<Response> => {
  if (!streamConfig.mp4Fallback) {
    return new Response('MP4 fallback not configured.', { status: 400 })
  }

  const videoId = bunnyData.stream?.videoId ?? ''
  const videoResolutions = bunnyData.stream?.resolutions

  const context = {
    collection,
    filename: '',
    signedUrls,
    tokenSecurityKey: streamConfig.tokenSecurityKey,
    usePayloadAccessControl,
  }

  let fallbackQuality: string | undefined = undefined
  let availableResolutions: string[] = []
  let metaNeedsUpdate = false

  if (videoResolutions?.highest) {
    const savedResolutionUrl = `https://${streamConfig.hostname}/${videoId}/play_${videoResolutions.highest}.mp4`
    const checkContext = { ...context, filename: `${videoId}/play_${videoResolutions.highest}.mp4` }

    try {
      const checkUrl = maybeGenerateSignedUrl(savedResolutionUrl, checkContext)
      const headResponse = await fetch(checkUrl, {
        headers: { 'Accept': 'video/mp4' },
        method: 'HEAD',
      })

      if (headResponse.ok) {
        fallbackQuality = videoResolutions.highest
        if (videoResolutions.available && videoResolutions.available.length > 0) {
          availableResolutions = videoResolutions.available
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
            metaNeedsUpdate = !videoResolutions?.highest ||
                             videoResolutions.highest !== fallbackQuality
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

  if (metaNeedsUpdate && fallbackQuality && docId && collection) {
    try {
      await req.payload.update({
        id: docId,
        collection: collection.slug,
        data: {
          bunnyVideoResolutions: {
            available: availableResolutions.length > 0 ? availableResolutions : undefined,
            highest: fallbackQuality,
          },
        },
      })
    } catch (err) {
      req.payload.logger.error({ err, msg: 'Failed to update bunnyVideoResolutions' })
    }
  }

  let mp4Url = `https://${streamConfig.hostname}/${videoId}/play_${fallbackQuality}.mp4`

  if (req.url) {
    const requestUrl = new URL(req.url, `http://${req.headers.get('host') || 'localhost'}`)
    if (requestUrl.search) {
      mp4Url += requestUrl.search
    }
  }

  const finalContext = { ...context, filename: `${videoId}/play_${fallbackQuality}.mp4` }

  const tokenPath = `/${videoId}/`

  const redirect = maybeCreateRedirect(mp4Url, finalContext, {
    tokenPath,
  })
  if (redirect) {
    return redirect
  }

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
