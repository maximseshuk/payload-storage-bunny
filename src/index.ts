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
import type { Config, UploadTransformer } from 'payload'

import { getAfterReadHook, getStreamSelect } from '@/server/payload/fields/bunnyGroupField.js'
import { getFields } from '@/server/payload/fields/getFields.js'
import { getStreamFilePreviewAdmin, warnIfStreamPreviewTurnedOff } from '@/server/payload/filePreview.js'
import {
  assertNoRemovedKeys,
  createCollectionContext,
  createNormalizedOptions,
  hasAnyStorage,
  hasAnyStreamCleanup,
  hasAnyStreamStatusSync,
  validateNormalizedOptions,
} from '@/server/payload/options/index.js'
import { getGenerateUploadInstructions } from '@/server/payload/storage/clientUploads/uploadInstructions.js'
import { getCopyFile, getDeleteFile } from '@/server/payload/storage/fileOperations.js'
import {
  getForgetStreamVideoHook,
  getGenerateUrl,
  getHandleDelete,
  getHandleUpload,
  getStaticHandler,
} from '@/server/payload/storage/index.js'
import { getStreamEndpoints } from '@/server/payload/stream/endpoints.js'
import {
  getAfterChangeHook,
  getBeforeValidateHook,
  getStreamBeforeChangeHook,
  getStreamFileChangeBeforeOperationHook,
  getStreamKeysBeforeChangeHook,
  getStreamKeysBeforeDeleteHook,
} from '@/server/payload/stream/hooks.js'
import { getStreamUploadSessionsCollection } from '@/server/payload/stream/sessionsCollection.js'
import { hasStreamClientUploads } from '@/server/payload/stream/tusUpload.js'
import { getTasksEndpoints } from '@/server/payload/tasks/endpoint.js'
import { getStreamCleanupTask, getStreamStatusSyncTask, warnIfTaskQueuesNotRun } from '@/server/payload/tasks/jobs.js'
import { reportTelemetry } from '@/server/telemetry/index.js'
import { PLUGIN_KEY } from '@/shared/constants.js'
import { translations } from '@/shared/translations/index.js'
import type { PluginDefaultTranslationsObject } from '@/shared/translations/types.js'
import type { BunnyStorageOptions, BunnyStoragePlugin } from '@/shared/types/index.js'
import type { NormalizedBunnyStorageOptions } from '@/shared/types/optionsNormalized.js'

export {
  getBunnyCollectionOptions,
  getBunnyOptions,
  getBunnyStorageForCollection,
  getBunnyStreamForCollection,
} from '@/server/payload/options/access.js'
export type {
  BunnyCollectionOptions,
  BunnyCollectionStorage,
  BunnyCollectionStream,
} from '@/server/payload/options/access.js'
export { runStreamCleanup } from '@/server/payload/tasks/runStreamCleanup.js'
export type { StreamCleanupResult } from '@/server/payload/tasks/runStreamCleanup.js'
export { syncStreamStatus } from '@/server/payload/tasks/syncStreamStatus.js'
export type { StreamStatusSyncResult } from '@/server/payload/tasks/syncStreamStatus.js'
export type { NormalizedBunnyStorageOptions, NormalizedCollectionOptions } from '@/shared/types/optionsNormalized.js'
export type { BunnyStorageCollectionOptions, BunnyStorageOptions } from '@/shared/types/index.js'

const getCloudStorageCollections = (
  collections: BunnyStorageOptions['collections'],
  adapter: Adapter | null,
): CloudStoragePluginOptions['collections'] =>
  Object.entries(collections).reduce(
    (acc, [slug, collOptions]) =>
      collOptions
        ? {
            ...acc,
            [slug]: {
              ...(collOptions === true ? {} : collOptions),
              adapter,
            },
          }
        : acc,
    {} as Record<string, CollectionOptions>,
  )

export const bunnyStorage: BunnyStoragePlugin = (pluginOptions: BunnyStorageOptions) => ({
  name: 'bunny',
  collections: Object.entries(pluginOptions.collections)
    .filter(([, collOptions]) => collOptions)
    .map(([slug]) => slug),
  init: (incomingConfig: Config): Config => {
    assertNoRemovedKeys(pluginOptions)

    if (pluginOptions.enabled === false) {
      return cloudStoragePlugin({
        collections: getCloudStorageCollections(pluginOptions.collections, null),
        enabled: false,
      })(incomingConfig)
    }

    const options = createNormalizedOptions(pluginOptions)
    validateNormalizedOptions(options)

    const collectionsWithAdapter = getCloudStorageCollections(
      pluginOptions.collections,
      bunnyStorageInternal(options, incomingConfig.upload?.transformers),
    )

    const dirname = path.dirname(fileURLToPath(import.meta.url))
    const streamEndpoints = getStreamEndpoints(options)
    const tasks = [getStreamCleanupTask(options), getStreamStatusSyncTask(options)].filter((task) => task !== undefined)
    const cliCommands = {
      ...(hasAnyStorage(options)
        ? {
            'bunny:deploy-edge-script': `${path.resolve(dirname, 'cli/commands/deployEdgeScript.js')}#deployEdgeScriptCommand`,
          }
        : {}),
      ...(hasAnyStreamCleanup(options) || hasAnyStreamStatusSync(options)
        ? { 'bunny:task': `${path.resolve(dirname, 'cli/commands/task.js')}#taskCommand` }
        : {}),
    }

    const finalConfig: Config = {
      ...incomingConfig,
      cli:
        incomingConfig.cli === false || Object.keys(cliCommands).length === 0
          ? incomingConfig.cli
          : {
              ...incomingConfig.cli,
              commands: {
                ...cliCommands,
                ...incomingConfig.cli?.commands,
              },
            },
      custom: {
        ...incomingConfig.custom,
        [PLUGIN_KEY]: {
          ...(incomingConfig.custom?.[PLUGIN_KEY] || {}),
          config: options,
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

          const collectionContext = createCollectionContext(options, collection)

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
                        Upload: {
                          path: '@seshuk/payload-storage-bunny/rsc#TusUploadServer',
                          serverProps: { collectionSlug: collection.slug },
                        },
                      }
                    : {}),
                },
              },
              ...(collectionContext.streamOptions
                ? {
                    custom: {
                      ...(collection.admin?.custom || {}),
                      '@seshuk/payload-storage-bunny': {
                        ...(collection.admin?.custom?.['@seshuk/payload-storage-bunny'] || {}),
                        stream: {
                          libraryId: collectionContext.streamOptions.libraryId,
                          ...(collectionContext.streamOptions.status && collectionContext.streamOptions.status.link
                            ? { link: true }
                            : {}),
                          mimeTypes: collectionContext.streamOptions.mimeTypes,
                          ...(collectionContext.isTusUploadSupported
                            ? {
                                tus: {
                                  autoMode: collectionContext.streamOptions.tus?.autoMode,
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
            ...(collectionContext.streamOptions?.status ? { select: getStreamSelect(collection.select) } : {}),
            hooks: {
              ...(collection.hooks || {}),
              afterChange: [...(collection.hooks?.afterChange || []), getAfterChangeHook(collectionContext)],
              afterRead: [
                ...(collection.hooks?.afterRead || []),
                ...(collectionContext.streamOptions ? [getAfterReadHook()] : []),
              ],
              beforeChange: [
                ...(collection.hooks?.beforeChange || []),
                ...(collectionContext.streamOptions
                  ? [getForgetStreamVideoHook(collectionContext), getStreamKeysBeforeChangeHook(collectionContext)]
                  : []),
                ...(collectionContext.streamOptions?.status || collectionContext.streamOptions?.mp4Fallback
                  ? [getStreamBeforeChangeHook(collectionContext)]
                  : []),
              ],
              beforeOperation: [
                ...(collection.hooks?.beforeOperation || []),
                ...(collectionContext.isTusUploadSupported
                  ? [getStreamFileChangeBeforeOperationHook(collectionContext)]
                  : []),
              ],
              beforeDelete: [
                ...(collection.hooks?.beforeDelete || []),
                ...(collectionContext.streamOptions ? [getStreamKeysBeforeDeleteHook(collectionContext)] : []),
              ],
              beforeValidate: [
                ...(collection.hooks?.beforeValidate || []),
                ...(collectionContext.isTusUploadSupported
                  ? [
                      getBeforeValidateHook({
                        options,
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
              ...(collectionContext.streamOptions?.preview
                ? { admin: getStreamFilePreviewAdmin(collection.upload, collectionContext.streamOptions) }
                : {}),
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
        ...(hasAnyStreamCleanup(options) ? [getStreamUploadSessionsCollection()] : []),
      ],
      endpoints: [...(incomingConfig.endpoints || []), ...streamEndpoints, ...getTasksEndpoints(options)],
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
        ...(tasks.length > 0
          ? {
              tasks: [...(incomingConfig.jobs?.tasks || []), ...tasks],
            }
          : {}),
      },
      onInit: async (payload) => {
        await incomingConfig.onInit?.(payload)
        warnIfTaskQueuesNotRun({ payload, tasks })
        warnIfStreamPreviewTurnedOff(payload)
        void reportTelemetry({ options, payload }).catch(() => {})
      },
    }

    const config = cloudStoragePlugin({
      collections: collectionsWithAdapter,
    })(finalConfig)

    return {
      ...config,
      collections: config.collections?.map((collection) => {
        const statusField = collection.fields.find(
          (field) => 'virtual' in field && field.virtual === 'bunnyData.stream.status' && field.name === 'bunnyStream',
        )
        return statusField
          ? { ...collection, fields: [...collection.fields.filter((field) => field !== statusField), statusField] }
          : collection
      }),
    }
  },
})

const bunnyStorageInternal = (
  options: NormalizedBunnyStorageOptions,
  transformers: undefined | UploadTransformer[],
): Adapter => {
  return ({ collection, prefix }): GeneratedAdapter => {
    const collectionContext = createCollectionContext(options, collection, prefix)
    const streamClientUploads = hasStreamClientUploads(collectionContext, transformers)

    return {
      name: 'bunny',
      copyFile: getCopyFile(collectionContext),
      deleteFile: getDeleteFile(collectionContext, options),
      fields: [],
      generateURL: getGenerateUrl(collectionContext),
      handleDelete: getHandleDelete(collectionContext),
      handleUpload: getHandleUpload(collectionContext),
      staticHandler: getStaticHandler(collectionContext),
      uploadInstructions: {
        ...(streamClientUploads && {
          adminHandler: { path: '@seshuk/payload-storage-bunny/client#BunnyClientUploadHandler' },
        }),
        enabled: true,
        generate: getGenerateUploadInstructions(collectionContext),
        requiresUploadReceipt: true,
        useInAdmin: !!collectionContext.storageOptions?.clientUploads || streamClientUploads,
      },
    }
  }
}
