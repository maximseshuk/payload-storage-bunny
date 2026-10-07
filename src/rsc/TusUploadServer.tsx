import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent'
import type { CollectionSlug, PayloadComponent, ServerProps } from 'payload'
import { matchMimeType } from 'payload/shared'
import React from 'react'

import { TusUpload } from '@/client/TusUpload/TusUpload.js'

export const TusUploadServer = async (props: { collectionSlug: string } & ServerProps): Promise<React.ReactElement> => {
  const { id, collectionSlug, locale, payload, user } = props
  const { controls, filePreview } = payload.collections[collectionSlug]?.config.upload?.admin?.components ?? {}
  const UploadControls = controls && (
    <RenderServerComponent Component={controls} importMap={payload.importMap} serverProps={props} />
  )

  if (!filePreview) {
    return <TusUpload UploadControls={UploadControls} />
  }

  const doc: Record<string, unknown> | undefined =
    id === undefined
      ? undefined
      : await payload
          .findByID({
            id,
            collection: collectionSlug as CollectionSlug,
            depth: 0,
            draft: true,
            fallbackLocale: false,
            locale: locale?.code,
            overrideAccess: false,
            trash: true,
            user,
          })
          .catch((err: unknown) => {
            payload.logger.error({ err, msg: '[bunny:stream] tus-upload: failed to read the document' })
            return undefined
          })

  const mimeType = typeof doc?.mimeType === 'string' ? doc.mimeType : ''
  const Component =
    typeof filePreview === 'string' || 'path' in filePreview
      ? (filePreview as PayloadComponent)
      : matchMimeType(filePreview, mimeType)

  if (!Component) {
    return <TusUpload UploadControls={UploadControls} />
  }

  return (
    <TusUpload
      UploadControls={UploadControls}
      UploadFilePreview={
        <RenderServerComponent
          clientProps={{
            filename: doc?.filename,
            filesize: doc?.filesize,
            fileSrc: doc?.url,
            height: doc?.height,
            mimeType,
            width: doc?.width,
          }}
          Component={Component}
          importMap={payload.importMap}
          serverProps={props}
        />
      }
    />
  )
}
