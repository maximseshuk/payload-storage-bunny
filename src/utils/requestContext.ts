import type { BunnyDataInternal } from '@/types/index.js'
import type { RequestContext } from 'payload'

type BunnyDataInput = {
  stream?: Partial<NonNullable<BunnyDataInternal['stream']>>
}

export const setBunnyData = (context: RequestContext, data: BunnyDataInput): void => {
  context.bunnyData ??= {}

  if (data.stream) {
    context.bunnyData.stream ??= { videoId: '' }
    if (data.stream.videoId !== undefined) {
      context.bunnyData.stream.videoId = data.stream.videoId
    }
    if (data.stream.resolutions !== undefined) {
      context.bunnyData.stream.resolutions = data.stream.resolutions
    }
  }
}
