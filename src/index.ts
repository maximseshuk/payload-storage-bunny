import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import type {
  Adapter,
  PluginOptions as CloudStoragePluginOptions,
  CollectionOptions,
  GeneratedAdapter,
} from '@payloadcms/plugin-cloud-storage/types'
import type { AcceptedLanguages } from '@payloadcms/translations'
import type { Config } from 'payload'

import { getStreamUploadSessionsCollection } from './collections/StreamUploadSessions.js'
import { getStreamEndpoints } from './endpoints/stream.js'
import { getFields } from './fields/index.js'
import { getGenerateURL, getHandleDelete, getHandleUpload, getStaticHandler } from './handlers/index.js'
import { getAfterChangeHook, getBeforeValidateHook } from './hooks/index.js'
import { getStreamCleanupTask } from './tasks/cleanup.js'
import { translations } from './translations/index.js'
import type { PluginDefaultTranslationsObject } from './translations/types.js'
import type { NormalizedBunnyStorageConfig } from './types/configNormalized.js'
import type { BunnyStorageConfig, BunnyStoragePlugin } from './types/index.js'
import { createCollectionContext, createNormalizedConfig, validateNormalizedConfig } from './utils/config/index.js'

export const bunnyStorage: BunnyStoragePlugin =
  (pluginConfig: BunnyStorageConfig) =>
  (incomingConfig: Config): Config => {
    if (pluginConfig.enabled === false) {
      return incomingConfig
    }

    const config = createNormalizedConfig(pluginConfig)
    validateNormalizedConfig(config)

    const adapter = bunnyStorageInternal(config)

    const collectionsWithAdapter: CloudStoragePluginOptions['collections'] = Object.entries(
      pluginConfig.collections,
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

    const streamEndpoints = config.stream ? getStreamEndpoints(config) : []
    const cleanupTask = config.stream?.cleanup ? getStreamCleanupTask(config.stream) : undefined

    const finalConfig: Config = {
      ...incomingConfig,
      collections: [
        ...(incomingConfig.collections || []).map((collection) => {
          if (!collectionsWithAdapter[collection.slug]) {
            return collection
          }

          if (!collection.upload) {
            throw new Error(
              `[@seshuk/payload-storage-bunny] Collection "${collection.slug}" is configured for Bunny storage but is not an upload collection. Add an "upload" config to the collection, or remove it from the plugin's "collections".`,
            )
          }

          const collectionContext = createCollectionContext(config, collection)

          const originalFilesRequiredOnCreate =
            typeof collection.upload === 'object' ? (collection.upload.filesRequiredOnCreate ?? true) : true

          const fields = getFields(collection, collectionContext, collection.fields)

          return {
            ...collection,
            admin: {
              ...(collection.admin || {}),
              components: {
                ...(collection.admin?.components || {}),
                edit: {
                  ...(collection.admin?.components?.edit || {}),
                  ...(collectionContext.isTusUploadSupported
                    ? {
                        Upload: '@seshuk/payload-storage-bunny/client#TusUpload',
                      }
                    : {}),
                },
              },
              ...(collectionContext.streamConfig
                ? {
                    custom: {
                      ...(collection.admin?.custom || {}),
                      '@seshuk/payload-storage-bunny': {
                        ...(collection.admin?.custom?.['@seshuk/payload-storage-bunny'] || {}),
                        stream: {
                          libraryId: collectionContext.streamConfig.libraryId,
                          mimeTypes: collectionContext.streamConfig.mimeTypes,
                          ...(collectionContext.isTusUploadSupported
                            ? {
                                tus: {
                                  autoMode: collectionContext.streamConfig.tus?.autoMode,
                                },
                              }
                            : {}),
                        },
                      },
                    },
                  }
                : {}),
            },
            fields,
            hooks: {
              ...(collection.hooks || {}),
              afterChange: [...(collection.hooks?.afterChange || []), getAfterChangeHook(collectionContext)],
              beforeValidate: [
                ...(collection.hooks?.beforeValidate || []),
                ...(collectionContext.isTusUploadSupported
                  ? [
                      getBeforeValidateHook({
                        context: collectionContext,
                        filesRequiredOnCreate: originalFilesRequiredOnCreate,
                      }),
                    ]
                  : []),
              ],
            },
            upload: {
              ...(typeof collection.upload === 'object' ? collection.upload : {}),
              adminThumbnail: undefined,
              ...(collectionContext.thumbnail?.appendTimestamp
                ? {
                    cacheTags: false,
                  }
                : {}),
              ...(collectionContext.isTusUploadSupported
                ? {
                    filesRequiredOnCreate: false,
                  }
                : {}),
              disableLocalStorage: true,
            },
          }
        }),
        ...(config.stream && config.stream.cleanup ? [getStreamUploadSessionsCollection()] : []),
      ],
      endpoints: [...(incomingConfig.endpoints || []), ...streamEndpoints],
      i18n: {
        ...incomingConfig.i18n,
        translations: {
          ...incomingConfig.i18n?.translations,
          ...Object.entries(translations).reduce(
            (acc, [locale, i18nObject]) => {
              const typedLocale = locale as AcceptedLanguages

              return {
                ...acc,
                [typedLocale]: {
                  ...incomingConfig.i18n?.translations?.[typedLocale],
                  '@seshuk/payload-storage-bunny': {
                    ...i18nObject['@seshuk/payload-storage-bunny'],
                    ...(config.i18n?.translations?.[typedLocale] || {}),
                  },
                },
              }
            },
            {} as Record<AcceptedLanguages, PluginDefaultTranslationsObject>,
          ),
        },
      },
      jobs: {
        ...(incomingConfig.jobs || {}),
        ...(cleanupTask
          ? {
              tasks: [...(incomingConfig.jobs?.tasks || []), cleanupTask],
            }
          : {}),
      },
    }

    return cloudStoragePlugin({
      collections: collectionsWithAdapter,
    })(finalConfig)
  }

const bunnyStorageInternal = (config: NormalizedBunnyStorageConfig): Adapter => {
  return ({ collection, prefix }): GeneratedAdapter => {
    const collectionContext = createCollectionContext(config, collection, prefix)

    return {
      name: 'bunny',
      fields: [],
      generateURL: getGenerateURL(collectionContext),
      handleDelete: getHandleDelete(collectionContext),
      handleUpload: getHandleUpload(collectionContext),
      staticHandler: getStaticHandler(collectionContext),
    }
  }
}
