import type { CollectionConfig, Payload, PayloadComponent, UploadConfig } from 'payload'

import { getBunnyOptions } from '@/server/payload/options/access.js'
import type { NormalizedStreamOptions } from '@/shared/types/index.js'

type FilePreview = NonNullable<NonNullable<UploadConfig['admin']>['components']>['filePreview']

const getPreviewCategories = (mimeTypes: string[]): string[] =>
  ['video/*', 'audio/*'].filter((category) => mimeTypes.some((type) => type.startsWith(category.slice(0, -1))))

export const getStreamFilePreviewAdmin = (
  upload: CollectionConfig['upload'],
  streamOptions: NormalizedStreamOptions,
): UploadConfig['admin'] => {
  const admin = typeof upload === 'object' ? upload.admin : undefined
  const filePreview: FilePreview = admin?.components?.filePreview
  const component: PayloadComponent = {
    clientProps: { status: streamOptions.status !== false },
    path: '@seshuk/payload-storage-bunny/client#StreamFilePreview',
  }
  const categories = getPreviewCategories(streamOptions.mimeTypes)
  const userOwnsAll =
    filePreview != null && (typeof filePreview !== 'object' || 'path' in filePreview || '*' in filePreview)

  return {
    ...admin,
    components: {
      ...admin?.components,
      filePreview:
        userOwnsAll || categories.length === 0
          ? filePreview
          : {
              ...Object.fromEntries(categories.map((category) => [category, component])),
              ...(filePreview as object),
            },
    },
  }
}

export const warnIfStreamPreviewTurnedOff = (payload: Payload): void => {
  for (const [slug, collection] of getBunnyOptions(payload)?.collections ?? []) {
    if (!collection.stream?.preview) {
      continue
    }
    const filePreview = payload.collections[slug]?.config.upload?.admin?.components?.filePreview
    if (typeof filePreview !== 'object' || filePreview === null || 'path' in filePreview) {
      continue
    }
    const categories = getPreviewCategories(collection.stream.mimeTypes)
    const keys = new Set([
      ...categories,
      ...collection.stream.mimeTypes.filter((type) => getPreviewCategories([type]).length > 0),
    ])
    const turnedOff = [...keys].filter((key) => (filePreview as Record<string, unknown>)[key] === false)
    if (turnedOff.length > 0) {
      payload.logger.warn({
        msg: `[bunny:stream] preview: collection "${slug}" sets filePreview ${new Intl.ListFormat('en').format(turnedOff.map((key) => `"${key}"`))} to false, so Stream files get Payload's own player, which cannot play HLS outside Safari. With the media preview plugin, add bunnyStreamAdapter to its adapters. Or set stream.preview: false to keep this filePreview`,
      })
    }
  }
}
