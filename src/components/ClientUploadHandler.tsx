'use client'

import { createClientUploadHandler } from '@payloadcms/plugin-cloud-storage/client'

export const BunnyClientUploadHandler = createClientUploadHandler({
  handler: async ({ apiRoute, collectionSlug, file, serverHandlerPath, serverURL, updateFilename }) => {
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

    const { filename, method, prefix, url } = (await response.json()) as {
      filename: string
      method?: string
      prefix?: string
      url: string
    }

    if (filename && filename !== file.name) {
      updateFilename(filename)
    }

    const uploadResponse = await fetch(url, {
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      method: method ?? 'PUT',
    })

    if (!uploadResponse.ok) {
      throw new Error(`Bunny upload failed (${uploadResponse.status})`)
    }

    return { prefix }
  },
})
