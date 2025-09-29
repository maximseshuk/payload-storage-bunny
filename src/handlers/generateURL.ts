import type { CollectionContext } from '@/types/index.js'
import type { GenerateURL } from '@payloadcms/plugin-cloud-storage/types'

import { applyUrlTransform, generateSignedUrl } from '@/utils/index.js'
import { posix } from 'node:path'

export const getGenerateURL = (context: CollectionContext): GenerateURL => {
  const { collection, signedUrls, storageConfig, streamConfig, urlTransform } = context

  return ({ data, filename, prefix = '' }) => {
    if (streamConfig && data.bunnyVideoId) {
      let streamUrl = `https://${streamConfig.hostname}/${data.bunnyVideoId}/playlist.m3u8`

      if (urlTransform) {
        streamUrl = applyUrlTransform({
          collection,
          config: urlTransform,
          data,
          filename,
          prefix,
          url: streamUrl,
        })
      }

      if (signedUrls && typeof signedUrls === 'object' && streamConfig.tokenSecurityKey) {
        const shouldSign = signedUrls.shouldUseSignedUrl
          ? signedUrls.shouldUseSignedUrl({ collection, filename })
          : true

        if (shouldSign) {
          return generateSignedUrl(streamUrl, streamConfig.tokenSecurityKey, signedUrls, {
            tokenPath: `/${data.bunnyVideoId}/`,
          })
        }
      }

      return streamUrl
    }

    if (!storageConfig) {
      return ''
    }

    let baseUrl = `https://${storageConfig.hostname}/${encodeURI(posix.join(prefix, filename))}`

    if (urlTransform) {
      baseUrl = applyUrlTransform({
        collection,
        config: urlTransform,
        data,
        filename,
        prefix,
        url: baseUrl,
      })
    }

    if (signedUrls && typeof signedUrls === 'object' && storageConfig.tokenSecurityKey) {
      const shouldSign = signedUrls.shouldUseSignedUrl
        ? signedUrls.shouldUseSignedUrl({ collection, filename })
        : true

      if (shouldSign) {
        return generateSignedUrl(baseUrl, storageConfig.tokenSecurityKey, signedUrls)
      }
    }

    return baseUrl
  }
}
