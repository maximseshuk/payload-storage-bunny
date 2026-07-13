import { posix } from 'node:path'

import type { HandleDelete } from '@payloadcms/plugin-cloud-storage/types'
import type { TFunction } from '@payloadcms/translations'
import { APIError } from 'payload'

import { purgeCache } from '@/cdn/purge.js'
import { getBunnyData } from '@/fields/bunnyGroupField.js'
import { deleteStorageFile } from '@/storage/api.js'
import { deleteStorageFileS3 } from '@/storage/s3.js'
import { deleteStreamVideo } from '@/stream/api.js'
import type { PluginStorageBunnyTranslationsKeys } from '@/translations/index.js'
import type { CollectionContext } from '@/types/index.js'

import { getGenerateUrl } from './generateUrl.js'

export const getHandleDelete = (context: CollectionContext): HandleDelete => {
  const { apiKey, purgeConfig, storageConfig, streamConfig } = context

  return async ({ collection, doc, filename, req }) => {
    const reqT = req.t as unknown as TFunction<PluginStorageBunnyTranslationsKeys>

    try {
      const bunnyData = getBunnyData(doc, filename)

      let fileUrl: null | string = null
      if (!bunnyData?.stream && purgeConfig) {
        fileUrl = await getGenerateUrl(context)({
          collection,
          data: doc,
          filename,
          prefix: doc.prefix || '',
        })
      }

      if (streamConfig && bunnyData?.stream) {
        await deleteStreamVideo({
          apiKey: streamConfig.apiKey,
          libraryId: streamConfig.libraryId,
          videoId: bunnyData.stream.videoId,
        })
      } else if (storageConfig) {
        const path = posix.join(doc.prefix || '', filename)

        if (storageConfig.s3) {
          await deleteStorageFileS3({
            apiKey: storageConfig.apiKey,
            path,
            s3: storageConfig.s3,
            zoneName: storageConfig.zoneName,
          })
        } else {
          await deleteStorageFile({
            apiKey: storageConfig.apiKey,
            path,
            region: storageConfig.region,
            zoneName: storageConfig.zoneName,
          })
        }

        if (purgeConfig && apiKey && fileUrl) {
          await purgeCache({ apiKey, async: purgeConfig.async, url: fileUrl })
          req.payload.logger.debug({
            action: 'Cache purged after delete',
            url: fileUrl,
          })
        }
      } else {
        req.payload.logger.debug({
          action: 'No storage or stream config, skipping delete',
          file: { name: filename },
        })
      }
    } catch (err) {
      req.payload.logger.error({
        err,
        file: { name: filename },
        ...(storageConfig && { storage: storageConfig.zoneName }),
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
