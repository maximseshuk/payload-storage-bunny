import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import type {
  Adapter,
  PluginOptions as CloudStoragePluginOptions,
  CollectionOptions,
  GeneratedAdapter,
} from '@payloadcms/plugin-cloud-storage/types'
import { initClientUploads } from '@payloadcms/plugin-cloud-storage/utilities'
import type { AcceptedLanguages } from '@payloadcms/translations'
import type { BinScriptConfig, Config } from 'payload'

import { getGenerateUrl, getHandleDelete, getHandleUpload, getStaticHandler } from './adapter/index.js'
import {
  createCollectionContext,
  createNormalizedConfig,
  hasAnyStorage,
  hasAnyStreamCleanup,
  validateNormalizedConfig,
} from './config/index.js'
import { getFields } from './fields/getFields.js'
import { clientUploadOperation } from './openapi.js'
import { getClientUploadHandler } from './storage/clientUploads/endpoint.js'
import { getPersistClientUploadPrefixHook } from './storage/clientUploads/persistPrefixHook.js'
import { getStreamCleanupTask } from './stream/cleanupTask.js'
import { getStreamEndpoints } from './stream/endpoints.js'
import { getAfterChangeHook, getBeforeValidateHook } from './stream/hooks.js'
import { getStreamUploadSessionsCollection } from './stream/sessionsCollection.js'
import { translations } from './translations/index.js'
import type { PluginDefaultTranslationsObject } from './translations/types.js'
import type { NormalizedBunnyStorageConfig } from './types/configNormalized.js'
import type { BunnyStorageConfig, BunnyStoragePlugin } from './types/index.js'
import { PLUGIN_KEY } from './utils/constants.js'

export {
  getBunnyCollectionConfig,
  getBunnyConfig,
  getBunnyStorageForCollection,
  getBunnyStreamForCollection,
} from './config/access.js'
export type { BunnyCollectionConfig, BunnyCollectionStorage, BunnyCollectionStream } from './config/access.js'
export type { NormalizedBunnyStorageConfig, NormalizedCollectionConfig } from './types/configNormalized.js'

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

    const streamEndpoints = getStreamEndpoints(config)
    const cleanupTask = getStreamCleanupTask(config)

    const dirname = path.dirname(fileURLToPath(import.meta.url))
    const pluginBin: BinScriptConfig[] = hasAnyStorage(config)
      ? [{ key: 'bunny:deploy-edge-script', scriptPath: path.resolve(dirname, 'bin/deployEdgeScript/script.js') }]
      : []
    const existingBin = incomingConfig.bin ?? []

    const finalConfig: Config = {
      ...incomingConfig,
      bin: [...existingBin, ...pluginBin.filter((entry) => !existingBin.some((b) => b.key === entry.key))],
      custom: {
        ...incomingConfig.custom,
        [PLUGIN_KEY]: {
          ...(incomingConfig.custom?.[PLUGIN_KEY] || {}),
          config,
        },
      },
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

          const hasDynamicClientUploadPrefix =
            typeof collectionContext.storageConfig?.clientUploads?.prefix === 'function'

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
              beforeChange: [
                ...(collection.hooks?.beforeChange || []),
                ...(hasDynamicClientUploadPrefix ? [getPersistClientUploadPrefixHook(collectionContext)] : []),
              ],
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
        ...(hasAnyStreamCleanup(config) ? [getStreamUploadSessionsCollection()] : []),
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

    const clientUploadCollections = [...config.collections.entries()].filter(
      ([, collection]) => collection.storage?.clientUploads,
    )

    if (clientUploadCollections.length > 0) {
      initClientUploads({
        clientHandler: '@seshuk/payload-storage-bunny/client#BunnyClientUploadHandler',
        collections: Object.fromEntries(
          clientUploadCollections.map(([slug, collection]) => [slug, { prefix: collection.prefix }]),
        ),
        config: finalConfig,
        enabled: true,
        serverHandler: getClientUploadHandler(config),
        serverHandlerPath: '/storage-bunny/storage/upload',
      })

      const clientUploadEndpoint = finalConfig.endpoints?.find((endpoint) =>
        endpoint.path?.startsWith('/storage-bunny/storage/upload'),
      )
      if (clientUploadEndpoint) {
        clientUploadEndpoint.custom = { ...clientUploadEndpoint.custom, openapi: clientUploadOperation }
      }
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
      ...(collectionContext.storageConfig?.clientUploads ? { clientUploads: true } : {}),
      fields: [],
      generateURL: getGenerateUrl(collectionContext),
      handleDelete: getHandleDelete(collectionContext),
      handleUpload: getHandleUpload(collectionContext),
      staticHandler: getStaticHandler(collectionContext),
    }
  }
}
