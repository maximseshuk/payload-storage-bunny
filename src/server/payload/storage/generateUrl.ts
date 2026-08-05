import type { GenerateURL } from '@payloadcms/plugin-cloud-storage/types'
import type { PayloadRequest } from 'payload'

import { readStoredVideo } from '@/server/payload/fields/bunnyGroupField.js'
import { maybeGenerateSignedUrl } from '@/server/payload/tokenAuth.js'
import { buildStorageCdnUrl, buildStreamCdnUrl } from '@/server/urls.js'
import type { CollectionContext } from '@/shared/types/index.js'
import { applyUrlTransform } from '@/shared/urlTransform.js'

type GenerateUrlArgs = { req?: PayloadRequest } & Parameters<GenerateURL>[0]

export const getGenerateUrl = (context: CollectionContext): ((args: GenerateUrlArgs) => string) => {
  const { collection, signedUrls, storageConfig, streamConfig, urlTransform } = context

  return ({ data, filename, prefix = '', req }) => {
    const videoId = readStoredVideo(data)?.videoId

    if (streamConfig && videoId) {
      let streamUrl = buildStreamCdnUrl(streamConfig.hostname, videoId, 'playlist.m3u8')

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
        { collection, filename, req, signedUrls, tokenSecurityKey: streamConfig.tokenSecurityKey },
        { tokenPath: `/${videoId}/` },
      )
    }

    if (!storageConfig) {
      return ''
    }

    let baseUrl = buildStorageCdnUrl(storageConfig.hostname, prefix, filename, true)

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
      req,
      signedUrls,
      tokenSecurityKey: storageConfig.tokenSecurityKey,
    })
  }
}
