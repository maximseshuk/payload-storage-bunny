import { posix } from 'node:path'

import type { HandleDelete } from '@payloadcms/plugin-cloud-storage/types'
import type { TFunction } from '@payloadcms/translations'
import { APIError } from 'payload'

import type { PluginStorageBunnyTranslationsKeys } from '@/translations/index.js'
import type { CollectionContext } from '@/types/index.js'
import { deleteStorageFile, deleteStreamVideo, purgeCache } from '@/utils/client/index.js'
import { getBunnyData } from '@/utils/streamVideo.js'

import { getGenerateURL } from './generateURL.js'

export const getHandleDelete = (context: CollectionContext): HandleDelete => {
  const { apiKey, purgeConfig, storageConfig, streamConfig } = context

  return async ({ collection, doc, filename, req }) => {
    const reqT = req.t as unknown as TFunction<PluginStorageBunnyTranslationsKeys>

    try {
      const bunnyData = getBunnyData(doc, filename)

      let fileUrl: null | string = null
      if (!bunnyData?.stream && purgeConfig) {
        fileUrl = await getGenerateURL(context)({
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

        await deleteStorageFile({
          apiKey: storageConfig.apiKey,
          path,
          region: storageConfig.region,
          zoneName: storageConfig.zoneName,
        })

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
