import type { HandleDelete } from '@payloadcms/plugin-cloud-storage/types'
import type { TFunction } from '@payloadcms/translations'
import { APIError } from 'payload'

import { purgeCache } from '@/server/bunny/cdn.js'
import { deleteStorageFileS3 } from '@/server/bunny/s3.js'
import { deleteStorageFile } from '@/server/bunny/storage.js'
import { deleteStreamVideo } from '@/server/bunny/stream.js'
import { getBunnyData } from '@/server/payload/fields/bunnyGroupField.js'
import { buildStoragePurgeUrl } from '@/server/urls.js'
import type { PluginStorageBunnyTranslationsKeys } from '@/shared/translations/index.js'
import type { CollectionContext } from '@/shared/types/index.js'

export const getHandleDelete = (context: CollectionContext): HandleDelete => {
  const { accountApiKey, purgeOptions, storageOptions, streamOptions } = context

  return async ({ doc, filename, req, storageFilePath: path }) => {
    const reqT = req.t as unknown as TFunction<PluginStorageBunnyTranslationsKeys>

    try {
      const bunnyData = getBunnyData(doc, filename)

      if (streamOptions && bunnyData?.stream) {
        await deleteStreamVideo({
          apiKey: streamOptions.apiKey,
          libraryId: streamOptions.libraryId,
          videoId: bunnyData.stream.videoId,
        })
      } else if (storageOptions) {
        if (storageOptions.s3) {
          await deleteStorageFileS3({
            apiKey: storageOptions.apiKey,
            path,
            region: storageOptions.region,
            zoneName: storageOptions.zoneName,
          })
        } else {
          await deleteStorageFile({
            apiKey: storageOptions.apiKey,
            path,
            region: storageOptions.region,
            zoneName: storageOptions.zoneName,
          })
        }

        if (purgeOptions && accountApiKey) {
          const fileUrl = buildStoragePurgeUrl({
            collectionPrefix: context.prefix,
            filename,
            hostname: storageOptions.hostname,
            prefix: doc.prefix,
          })
          try {
            await purgeCache({ apiKey: accountApiKey, async: purgeOptions.async, url: fileUrl })
            req.payload.logger.debug({
              msg: '[bunny:storage] delete: cache purged',
              url: fileUrl,
            })
          } catch (err) {
            req.payload.logger.error({
              err,
              msg: '[bunny:storage] delete: cache purge failed',
              url: fileUrl,
            })
          }
        }
      } else {
        req.payload.logger.debug({
          file: { name: filename },
          msg: '[bunny:storage] delete: skipping, no storage or stream config',
        })
      }
    } catch (err) {
      req.payload.logger.error({
        err,
        file: { name: filename },
        msg: '[bunny:storage] delete: failed',
        ...(storageOptions && { storage: storageOptions.zoneName }),
      })

      throw new APIError(
        reqT('@seshuk/payload-storage-bunny:errorDeleteFileFailed', { filename }),
        500,
        undefined,
        true,
      )
    }
  }
}
