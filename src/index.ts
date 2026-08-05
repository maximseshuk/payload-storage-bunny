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

import {
  createCollectionContext,
  createNormalizedConfig,
  hasAnyStorage,
  hasAnyStreamCleanup,
  validateNormalizedConfig,
} from './server/payload/config/index.js'
import { getAfterReadHook } from './server/payload/fields/bunnyGroupField.js'
import { getFields } from './server/payload/fields/getFields.js'
import { clientUploadOperation } from './server/payload/openapi.js'
import { getClientUploadHandler } from './server/payload/storage/clientUploads/endpoint.js'
import { getBeforeChangeHook } from './server/payload/storage/clientUploads/persistPrefixHook.js'
import { getGenerateUrl, getHandleDelete, getHandleUpload, getStaticHandler } from './server/payload/storage/index.js'
import { getStreamCleanupTask } from './server/payload/stream/cleanupTask.js'
import { getStreamEndpoints } from './server/payload/stream/endpoints.js'
import { getAfterChangeHook, getBeforeValidateHook } from './server/payload/stream/hooks.js'
import { getStreamUploadSessionsCollection } from './server/payload/stream/sessionsCollection.js'
import { reportTelemetry } from './server/telemetry/index.js'
import { PLUGIN_KEY } from './shared/constants.js'
import { translations } from './shared/translations/index.js'
import type { PluginDefaultTranslationsObject } from './shared/translations/types.js'
import type { NormalizedBunnyStorageConfig } from './shared/types/configNormalized.js'
import type { BunnyStorageConfig, BunnyStoragePlugin } from './shared/types/index.js'

export {
  getBunnyCollectionConfig,
  getBunnyConfig,
  getBunnyStorageForCollection,
  getBunnyStreamForCollection,
} from './server/payload/config/access.js'
export type {
  BunnyCollectionConfig,
  BunnyCollectionStorage,
  BunnyCollectionStream,
} from './server/payload/config/access.js'
export type { NormalizedBunnyStorageConfig, NormalizedCollectionConfig } from './shared/types/configNormalized.js'

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
      ? [
          {
            key: 'bunny:deploy-edge-script',
            scriptPath: path.resolve(dirname, 'cli/commands/deployEdgeScript.js'),
          },
        ]
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
              afterRead: [
                ...(collection.hooks?.afterRead || []),
                ...(collectionContext.streamConfig ? [getAfterReadHook()] : []),
              ],
              beforeChange: [
                ...(collection.hooks?.beforeChange || []),
                ...(hasDynamicClientUploadPrefix ? [getBeforeChangeHook(collectionContext)] : []),
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
              // Payload appends ?<updatedAt> to admin thumbnails. Bunny signs the query
              // string, so on direct CDN URLs that extra param invalidates the token.
              ...(collectionContext.thumbnail?.appendTimestamp ||
              (collectionContext.signedUrls && !collectionContext.usePayloadAccessControl)
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
      onInit: async (payload) => {
        await incomingConfig.onInit?.(payload)
        void reportTelemetry({ config, payload }).catch(() => {})
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
