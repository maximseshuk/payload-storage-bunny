import type { PayloadRequest } from 'payload'

import type { BunnyAdapterOptions, BunnyResolutionsResponse, BunnyVideoMeta } from './types.js'

export const streamStaticHandler = async (
  req: PayloadRequest,
  stream: NonNullable<BunnyAdapterOptions['stream']>,
  {
    collection,
    docId,
    videoId,
    videoMeta,
  }: {
    collection: string
    docId: number | string
    videoId: string
    videoMeta: BunnyVideoMeta | null
  },
): Promise<Response> => {
  const fallbackEnabled = stream.mp4Fallback?.enabled || !!stream.mp4FallbackQuality

  if (!fallbackEnabled) {
    return new Response('MP4 fallback not configured.', { status: 400 })
  }

  let fallbackQuality: string | undefined = undefined
  let availableResolutions: string[] = []
  let metaNeedsUpdate = false

  if (videoMeta && typeof videoMeta === 'object' && 'highestMp4Resolution' in videoMeta && videoMeta.highestMp4Resolution) {
    const savedResolutionUrl = `https://${stream.hostname}/${videoId}/play_${videoMeta.highestMp4Resolution}.mp4`

    try {
      const headResponse = await fetch(savedResolutionUrl, {
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
    } catch (error) {
      req.payload.logger.error(`Error checking saved resolution: ${error instanceof Error ? error.message : String(error)}`)
      metaNeedsUpdate = true
    }
  } else {
    metaNeedsUpdate = true
  }

  if (!fallbackQuality) {
    try {
      const resolutionsUrl = `https://video.bunnycdn.com/library/${stream.libraryId}/videos/${videoId}/resolutions`
      const resolutionsResponse = await fetch(resolutionsUrl, {
        headers: {
          'Accept': 'application/json',
          'AccessKey': stream.apiKey || '',
        },
      })

      if (resolutionsResponse.ok) {
        const resolutionsData = await resolutionsResponse.json() as BunnyResolutionsResponse

        if (resolutionsData.success && resolutionsData.data.mp4Resolutions.length > 0) {
          availableResolutions = resolutionsData.data.mp4Resolutions.map(r => r.resolution)

          if (availableResolutions.length > 0) {
            const sortedResolutions = [...availableResolutions].sort((a, b) =>
              parseInt(b.replace('p', '')) - parseInt(a.replace('p', '')),
            )

            for (const resolution of sortedResolutions) {
              const checkUrl = `https://${stream.hostname}/${videoId}/play_${resolution}.mp4`
              try {
                const headResponse = await fetch(checkUrl, {
                  headers: { 'Accept': 'video/mp4' },
                  method: 'HEAD',
                })

                if (headResponse.ok) {
                  fallbackQuality = resolution
                  break
                }
              } catch (error) {
                req.payload.logger.error(`Error checking resolution ${resolution}: ${error instanceof Error ? error.message : String(error)}`)
              }
            }

            if (fallbackQuality) {
              metaNeedsUpdate = !videoMeta ||
                !videoMeta.highestMp4Resolution ||
                videoMeta.highestMp4Resolution !== fallbackQuality
            }
          }
        } else {
          req.payload.logger.error('No MP4 resolutions available from Bunny API')
        }
      } else {
        req.payload.logger.error(`Failed to fetch available resolutions: ${resolutionsResponse.status}`)
      }
    } catch (error) {
      req.payload.logger.error(`Error fetching available resolutions: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (!fallbackQuality) {
    return new Response('Could not determine a valid resolution for the video', { status: 404 })
  }

  if (metaNeedsUpdate && fallbackQuality && docId && collection) {
    try {
      await req.payload.update({
        id: docId,
        collection,
        data: {
          bunnyVideoMeta: {
            availableMp4Resolutions: availableResolutions.length > 0 ? availableResolutions : undefined,
            highestMp4Resolution: fallbackQuality,
          },
        },
      })
    } catch (error) {
      req.payload.logger.error(`Failed to update bunnyVideoMeta: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const rangeHeader = req.headers.get('range')
  const requestHeaders = new Headers()
  if (rangeHeader) {
    requestHeaders.set('Range', rangeHeader)
  }

  const mp4Url = `https://${stream.hostname}/${videoId}/play_${fallbackQuality}.mp4`

  const response = await fetch(mp4Url, {
    headers: requestHeaders,
  })

  if (!response.ok && response.status !== 206) {
    return new Response(null, { status: 404, statusText: 'Not Found' })
  }

  const responseHeaders = new Headers()
  response.headers.forEach((value, key) => {
    responseHeaders.set(key, value)
  })

  if (!responseHeaders.has('content-type')) {
    responseHeaders.set('content-type', 'video/mp4')
  }

  return new Response(response.body, {
    headers: responseHeaders,
    status: response.status,
  })
}
