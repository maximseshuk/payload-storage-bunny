import { posix } from 'node:path'

import type { GenerateURL } from '@payloadcms/plugin-cloud-storage/types'

import { maybeGenerateSignedUrl } from '@/cdn/tokenAuth.js'
import type { BunnyData, CollectionContext } from '@/types/index.js'
import { applyUrlTransform } from '@/utils/urlTransform.js'

export const getGenerateURL = (context: CollectionContext): GenerateURL => {
  const { collection, signedUrls, storageConfig, streamConfig, urlTransform } = context

  return ({ data, filename, prefix = '' }) => {
    const bunnyData = data?.bunnyData as BunnyData | undefined

    if (streamConfig && bunnyData && bunnyData.type === 'stream' && bunnyData.stream) {
      let streamUrl = `https://${streamConfig.hostname}/${bunnyData.stream.videoId}/playlist.m3u8`

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

      return maybeGenerateSignedUrl(
        streamUrl,
        { collection, filename, signedUrls, tokenSecurityKey: streamConfig.tokenSecurityKey },
        { tokenPath: `/${bunnyData.stream.videoId}/` },
      )
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

    return maybeGenerateSignedUrl(baseUrl, {
      collection,
      filename,
      signedUrls,
      tokenSecurityKey: storageConfig.tokenSecurityKey,
    })
  }
}
