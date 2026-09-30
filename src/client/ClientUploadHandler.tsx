'use client'

import { createClientUploadHandler } from '@payloadcms/plugin-cloud-storage/client'

import { matchesMimeTypePattern } from '@/shared/mimeTypes.js'
import type { BunnyClientUploadExtra } from '@/shared/types/index.js'

import { uploadStreamVideo } from './uploadStreamVideo.js'

const MIME_SNIFF_BYTES = 4100

export const BunnyClientUploadHandler = createClientUploadHandler<BunnyClientUploadExtra>({
  handler: async ({ apiRoute, collectionSlug, extra, file, serverHandlerPath, serverURL, updateFilename }) => {
    if (extra?.streamMimeTypes?.some((pattern) => matchesMimeTypePattern(file.type, pattern))) {
      const headBytes = new Uint8Array(await file.slice(0, MIME_SNIFF_BYTES).arrayBuffer())
      const head = btoa(String.fromCharCode(...headBytes))
      return uploadStreamVideo({ apiRoute, collectionSlug, file, head, serverURL })
    }

    const response = await fetch(`${serverURL}${apiRoute}${serverHandlerPath}`, {
      body: JSON.stringify({
        collectionSlug,
        filename: file.name,
        filesize: file.size,
        mimeType: file.type,
      }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error(`Failed to prepare Bunny upload (${response.status})`)
    }

    const { clientUploadContext, filename, headers, method, url } = (await response.json()) as {
      clientUploadContext: Record<string, unknown>
      filename: string
      headers?: Record<string, string>
      method?: string
      url: string
    }

    if (filename && filename !== file.name) {
      updateFilename(filename)
    }

    const uploadResponse = await fetch(url, {
      body: file,
      headers: headers ?? { 'Content-Type': file.type || 'application/octet-stream' },
      method: method ?? 'PUT',
    })

    if (!uploadResponse.ok) {
      throw new Error(`Bunny upload failed (${uploadResponse.status})`)
    }

    return clientUploadContext
  },
})
