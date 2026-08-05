import { type CollectionConfig, NotFound, type PayloadRequest } from 'payload'

import { getStreamVideoResolutions, parseMp4Resolutions } from '@/server/bunny/stream.js'
import { httpFetch } from '@/server/http/index.js'
import { maybeCreateRedirect, maybeGenerateSignedUrl } from '@/server/payload/tokenAuth.js'
import { buildStreamCdnUrl } from '@/server/urls.js'
import { createProxyResponse } from '@/shared/http.js'
import type { BunnyDataInternal } from '@/shared/types/core.js'
import type { NormalizedSignedUrlsConfig, NormalizedStreamConfig } from '@/shared/types/index.js'

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

  const referer = streamConfig.referer

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
    const savedResolutionUrl = buildStreamCdnUrl(streamConfig.hostname, videoId, `play_${videoResolutions.highest}.mp4`)
    const checkContext = { ...context, filename: `${videoId}/play_${videoResolutions.highest}.mp4` }

    try {
      const checkUrl = maybeGenerateSignedUrl(savedResolutionUrl, checkContext)
      const headResponse = await httpFetch(checkUrl, {
        headers: { Accept: 'video/mp4', ...(referer ? { Referer: referer } : {}) },
        method: 'head',
        stream: true,
        throwHttpErrors: false,
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
      req.payload.logger.error({ err, msg: '[bunny:stream] mp4-fallback: error checking saved resolution' })
      metaNeedsUpdate = true
    }
  } else {
    metaNeedsUpdate = true
  }

  if (!fallbackQuality) {
    try {
      const resolutionsData = await getStreamVideoResolutions({
        apiKey: streamConfig.apiKey,
        libraryId: streamConfig.libraryId,
        videoId,
      })

      if (
        resolutionsData.success &&
        resolutionsData.data.mp4Resolutions &&
        resolutionsData.data.mp4Resolutions.length > 0
      ) {
        const { available, sorted } = parseMp4Resolutions(resolutionsData.data)
        availableResolutions = available

        if (available.length > 0) {
          for (const resolution of sorted) {
            const baseCheckUrl = buildStreamCdnUrl(streamConfig.hostname, videoId, `play_${resolution}.mp4`)
            const checkContext = { ...context, filename: `${videoId}/play_${resolution}.mp4` }
            const checkUrl = maybeGenerateSignedUrl(baseCheckUrl, checkContext)

            try {
              const headResponse = await httpFetch(checkUrl, {
                headers: { Accept: 'video/mp4', ...(referer ? { Referer: referer } : {}) },
                method: 'head',
                stream: true,
                throwHttpErrors: false,
              })

              if (headResponse.ok) {
                fallbackQuality = resolution
                break
              }
            } catch (err) {
              req.payload.logger.error({
                err,
                msg: `[bunny:stream] mp4-fallback: error checking resolution ${resolution}`,
              })
            }
          }

          if (fallbackQuality) {
            metaNeedsUpdate = !videoResolutions?.highest || videoResolutions.highest !== fallbackQuality
          }
        }
      } else {
        req.payload.logger.debug({
          msg: '[bunny:stream] mp4-fallback: no resolutions available (video may still be processing)',
        })
      }
    } catch (err) {
      req.payload.logger.debug({
        err,
        msg: '[bunny:stream] mp4-fallback: error fetching resolutions (video may still be processing)',
      })
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
          bunnyData: {
            stream: {
              resolutions: {
                available: availableResolutions.length > 0 ? availableResolutions : undefined,
                highest: fallbackQuality,
              },
            },
          },
        },
      })
    } catch (err) {
      if (!(err instanceof NotFound)) {
        req.payload.logger.error({ err, msg: '[bunny:stream] mp4-fallback: failed to update bunnyData resolutions' })
      }
    }
  }

  let mp4Url = buildStreamCdnUrl(streamConfig.hostname, videoId, `play_${fallbackQuality}.mp4`)

  if (req.url) {
    const requestUrl = new URL(req.url, `http://${req.headers.get('host') || 'localhost'}`)
    if (requestUrl.search) {
      mp4Url += requestUrl.search
    }
  }

  const finalContext = { ...context, filename: `${videoId}/play_${fallbackQuality}.mp4` }

  const tokenPath = `/${videoId}/`

  const redirect = maybeCreateRedirect(
    mp4Url,
    { ...finalContext, req },
    {
      tokenPath,
    },
  )
  if (redirect) {
    return redirect
  }

  const rangeHeader = req.headers.get('range')
  const requestHeaders = new Headers()
  if (referer) {
    requestHeaders.set('Referer', referer)
  }
  if (rangeHeader) {
    requestHeaders.set('Range', rangeHeader)
  }

  const fetchUrl = maybeGenerateSignedUrl(mp4Url, finalContext, {
    tokenPath,
  })

  const response = await httpFetch(fetchUrl, {
    headers: requestHeaders,
    stream: true,
    throwHttpErrors: false,
  })

  if (!response.ok && response.status !== 206) {
    return new Response(null, { status: 404, statusText: 'Not Found' })
  }

  return createProxyResponse(response, {
    additionalHeaders: !response.headers.has('content-type') ? { 'content-type': 'video/mp4' } : undefined,
  })
}
