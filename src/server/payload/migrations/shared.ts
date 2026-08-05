export const LEGACY_VIDEO_ID_FIELD = 'bunnyVideoId'
export const LEGACY_META_FIELD = 'bunnyVideoMeta'
export const LEGACY_VIDEO_ID_COLUMN = 'bunny_video_id'
export const LEGACY_META_COLUMN = 'bunny_video_meta'
export const NEW_VIDEO_ID_COLUMN = 'bunny_data_stream_video_id'
export const NEW_RESOLUTIONS_COLUMN = 'bunny_data_stream_resolutions'

export type BunnyCollectionTarget = {
  hasResolutions: boolean
  slug: string
}
