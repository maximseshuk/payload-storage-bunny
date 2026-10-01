'use client'

import { createClientUploadHandler } from '@payloadcms/plugin-cloud-storage/client'

import { uploadStreamVideo } from './uploadStreamVideo.js'

const MIME_SNIFF_BYTES = 4100

export const BunnyClientUploadHandler = createClientUploadHandler({
  name: 'bunny',
  handler: async ({ apiRoute, collectionSlug, file, serverURL, updateFilename }) => {
    const headBytes = new Uint8Array(await file.slice(0, MIME_SNIFF_BYTES).arrayBuffer())
    const head = btoa(String.fromCharCode(...headBytes))
    return uploadStreamVideo({ apiRoute, collectionSlug, file, head, serverURL, updateFilename })
  },
})
