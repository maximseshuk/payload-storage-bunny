import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import type {
  Adapter,
  PluginOptions as CloudStoragePluginOptions,
  CollectionOptions,
  GeneratedAdapter,
} from '@payloadcms/plugin-cloud-storage/types'
import type { AcceptedLanguages } from '@payloadcms/translations'
import type { Config } from 'payload'

import {
  createCollectionContext,
  createNormalizedConfig,
  hasAnyStorage,
  hasAnyStreamCleanup,
  validateNormalizedConfig,
} from './server/payload/config/index.js'
import { getAfterReadHook } from './server/payload/fields/bunnyGroupField.js'
import { getFields } from './server/payload/fields/getFields.js'
import {
  getBeforeChangeHook,
  getBeforeOperationHook,
} from './server/payload/storage/clientUploads/persistPrefixHook.js'
import { getGenerateUploadInstructions } from './server/payload/storage/clientUploads/uploadInstructions.js'
import { getGenerateUrl, getHandleDelete, getHandleUpload, getStaticHandler } from './server/payload/storage/index.js'
import { getStreamCleanupTask } from './server/payload/stream/cleanupTask.js'
import { hasStreamClientUploads } from './server/payload/stream/clientUploads.js'
import { getStreamEndpoints } from './server/payload/stream/endpoints.js'
import { getAfterChangeHook, getBeforeValidateHook } from './server/payload/stream/hooks.js'
import { getStreamUploadSessionsCollection } from './server/payload/stream/sessionsCollection.js'
import { reportTelemetry } from './server/telemetry/index.js'
import { PLUGIN_KEY } from './shared/constants.js'
import { translations } from './shared/translations/index.js'
import type { PluginDefaultTranslationsObject } from './shared/translations/types.js'
import type { NormalizedBunnyStorageConfig } from './shared/types/configNormalized.js'
import type { BunnyStorageConfig, BunnyStoragePlugin, CollectionContext } from './shared/types/index.js'

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

const CLIENT_UPLOAD_HANDLER_PATH = '@seshuk/payload-storage-bunny/client#BunnyClientUploadHandler'

const getCloudStorageCollections = (
  collections: BunnyStorageConfig['collections'],
  adapter: Adapter | null,
): CloudStoragePluginOptions['collections'] =>
  Object.entries(collections).reduce(
    (acc, [slug, collOptions]) => ({
      ...acc,
      [slug]: {
        ...(collOptions === true ? {} : collOptions),
        adapter,
      },
    }),
    {} as Record<string, CollectionOptions>,
  )

export const bunnyStorage: BunnyStoragePlugin = (pluginConfig: BunnyStorageConfig) => ({
  name: 'bunny',
  collections: Object.keys(pluginConfig.collections),
  init: (incomingConfig: Config): Config => {
    if (pluginConfig.enabled === false) {
      return cloudStoragePlugin({
        collections: getCloudStorageCollections(pluginConfig.collections, null),
        enabled: false,
      })(incomingConfig)
    }

    const config = createNormalizedConfig(pluginConfig)
    validateNormalizedConfig(config)

    const collectionsWithAdapter = getCloudStorageCollections(pluginConfig.collections, bunnyStorageInternal(config))

    const streamEndpoints = getStreamEndpoints(config)
    const cleanupTask = getStreamCleanupTask(config)

    const dirname = path.dirname(fileURLToPath(import.meta.url))

    const finalConfig: Config = {
      ...incomingConfig,
      admin: {
        ...incomingConfig.admin,
        dependencies: {
          ...incomingConfig.admin?.dependencies,
          [CLIENT_UPLOAD_HANDLER_PATH]: { type: 'component', path: CLIENT_UPLOAD_HANDLER_PATH },
        },
      },
      cli:
        incomingConfig.cli === false || !hasAnyStorage(config)
          ? incomingConfig.cli
          : {
              ...incomingConfig.cli,
              commands: {
                'bunny:deploy-edge-script': `${path.resolve(dirname, 'cli/commands/deployEdgeScript.js')}#deployEdgeScriptCommand`,
                ...incomingConfig.cli?.commands,
              },
            },
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
          const usesClientUploadReceipt =
            !!collectionContext.storageConfig?.clientUploads || collectionContext.isTusUploadSupported

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
              afterRead: [
                ...(collection.hooks?.afterRead || []),
                ...(collectionContext.streamConfig ? [getAfterReadHook()] : []),
              ],
              beforeChange: [
                ...(collection.hooks?.beforeChange || []),
                ...(usesClientUploadReceipt ? [getBeforeChangeHook(collectionContext)] : []),
              ],
              beforeOperation: [
                ...(collection.hooks?.beforeOperation || []),
                ...(usesClientUploadReceipt ? [getBeforeOperationHook(collectionContext)] : []),
              ],
              beforeValidate: [
                ...(collection.hooks?.beforeValidate || []),
                ...(collectionContext.isTusUploadSupported
                  ? [
                      getBeforeValidateHook({
                        config,
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
                  [PLUGIN_KEY]: {
                    ...i18nObject[PLUGIN_KEY],
                    ...(incomingConfig.i18n?.translations?.[typedLocale] as Partial<PluginDefaultTranslationsObject>)?.[
                      PLUGIN_KEY
                    ],
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

    return cloudStoragePlugin({
      collections: collectionsWithAdapter,
    })(finalConfig)
  },
})

const hasClientUploads = (context: CollectionContext): boolean =>
  !!context.storageConfig?.clientUploads || hasStreamClientUploads(context)

const bunnyStorageInternal = (config: NormalizedBunnyStorageConfig): Adapter => {
  return ({ collection, prefix }): GeneratedAdapter => {
    const collectionContext = createCollectionContext(config, collection, prefix)

    return {
      name: 'bunny',
      fields: [],
      generateURL: getGenerateUrl(collectionContext),
      handleDelete: getHandleDelete(collectionContext),
      handleUpload: getHandleUpload(collectionContext),
      staticHandler: getStaticHandler(collectionContext),
      uploadInstructions: {
        ...(hasStreamClientUploads(collectionContext) ? { adminHandler: { path: CLIENT_UPLOAD_HANDLER_PATH } } : {}),
        enabled: true,
        generate: getGenerateUploadInstructions(collectionContext),
        requiresUploadReceipt: true,
        useInAdmin: hasClientUploads(collectionContext),
      },
    }
  }
}
