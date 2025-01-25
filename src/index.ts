import type {
  Adapter,
  PluginOptions as CloudStoragePluginOptions,
  CollectionOptions,
  GeneratedAdapter,
} from '@payloadcms/plugin-cloud-storage/types'
import type { Config, Field } from 'payload'

import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import { posix } from 'node:path'

import type { AdminThumbnailOptions, BunnyPlugin, BunnyStorageOptions } from './types.js'

import { getGenerateURL } from './generateURL.js'
import { getHandleDelete } from './handleDelete.js'
import { getHandleUpload } from './handleUpload.js'
import { getStaticHandler } from './staticHandler.js'
import { isImage } from './utils.js'

export const bunnyStorage: BunnyPlugin =
  (bunnyStorageOptions: BunnyStorageOptions) =>
  (incomingConfig: Config): Config => {
    if (bunnyStorageOptions.enabled === false) {
      return incomingConfig
    }

    const adapter = bunnyInternal(bunnyStorageOptions)

    const collectionsWithAdapter: CloudStoragePluginOptions['collections'] = Object.entries(
      bunnyStorageOptions.collections,
    ).reduce(
      (acc, [slug, collOptions]) => ({
        ...acc,
        [slug]: {
          ...(collOptions === true ? {} : collOptions),
          adapter,
        },
      }),
      {} as Record<string, CollectionOptions>,
    )

    const config: Config = {
      ...incomingConfig,
      collections: (incomingConfig.collections || []).map((collection) => {
        if (!collectionsWithAdapter[collection.slug]) {
          return collection
        }

        return {
          ...collection,
          upload: {
            ...(typeof collection.upload === 'object' ? collection.upload : {}),
            adminThumbnail:
              bunnyStorageOptions.options.adminThumbnail !== undefined
                ? ({ doc }: { doc: Record<string, unknown> }): null | string => {
                    const { adminThumbnail = true, storage, stream } = bunnyStorageOptions.options
                    const hasUpdatedAt = doc.updatedAt !== null
                    const timestampQuery = hasUpdatedAt
                      ? `t=${Date.parse(doc.updatedAt as string)}`
                      : ''

                    if (stream && doc.bunnyVideoId && typeof doc.bunnyVideoId === 'string') {
                      const baseUrl = `https://${stream.hostname}/${doc.bunnyVideoId}/thumbnail.jpg`
                      return timestampQuery ? `${baseUrl}?${timestampQuery}` : baseUrl
                    }

                    if (doc.mimeType && isImage(doc.mimeType as string)) {
                      const filename = doc.filename as string
                      const prefix = (doc.prefix as string) || ''
                      const baseUrl = `https://${storage.hostname}/${posix.join(prefix, filename)}`

                      if (adminThumbnail === true) {
                        return timestampQuery ? `${baseUrl}?${timestampQuery}` : baseUrl
                      }

                      const options = adminThumbnail as AdminThumbnailOptions
                      const queryParams = new URLSearchParams(options.queryParams || {})
                      if (options.appendTimestamp && hasUpdatedAt) {
                        queryParams.append('t', Date.parse(doc.updatedAt as string).toString())
                      }

                      const queryString = queryParams.toString()
                      return queryString ? `${baseUrl}?${queryString}` : baseUrl
                    }

                    return null
                  }
                : undefined,
            disableLocalStorage: true,
          },
        }
      }),
    }

    return cloudStoragePlugin({
      collections: collectionsWithAdapter,
    })(config)
  }

const bunnyInternal = ({ options }: BunnyStorageOptions): Adapter => {
  const fields: Field[] = options.stream
    ? [
        {
          name: 'bunnyVideoId',
          type: 'text',
          admin: {
            disabled: true,
            hidden: true,
          },
        },
      ]
    : []

  return ({ collection, prefix }): GeneratedAdapter => {
    return {
      name: 'bunny',
      fields,
      generateURL: getGenerateURL(options),
      handleDelete: getHandleDelete(options),
      handleUpload: getHandleUpload({ ...options, prefix }),
      staticHandler: getStaticHandler({ ...options, collection, prefix }),
    }
  }
}
