import { posix } from 'node:path'

import type { GenerateURL } from '@payloadcms/plugin-cloud-storage/types'

import { maybeGenerateSignedUrl } from '@/cdn/tokenAuth.js'
import { readStoredVideo } from '@/fields/bunnyGroupField.js'
import type { CollectionContext } from '@/types/index.js'
import { applyUrlTransform } from '@/utils/urlTransform.js'

export const getGenerateUrl = (context: CollectionContext): GenerateURL => {
  const { collection, signedUrls, storageConfig, streamConfig, urlTransform } = context

  return ({ data, filename, prefix = '' }) => {
    const videoId = readStoredVideo(data)?.videoId

    if (streamConfig && videoId) {
      let streamUrl = `https://${streamConfig.hostname}/${videoId}/playlist.m3u8`

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
        { tokenPath: `/${videoId}/` },
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
