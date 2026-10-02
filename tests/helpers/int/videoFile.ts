import path from 'node:path'

import { getFileByPath } from 'payload'

export const videoFile = async (name: string) => ({
  ...(await getFileByPath(path.resolve(import.meta.dirname, '../../fixtures/test-video.mp4')))!,
  name,
})
