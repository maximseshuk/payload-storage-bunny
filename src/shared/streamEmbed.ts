export const STREAM_EMBED_ORIGIN = 'https://iframe.mediadelivery.net'

export const STREAM_PLAYER_ALLOW = 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;'

export const getBunnyEmbedUrl = (libraryId: number, videoId: string): string =>
  `${STREAM_EMBED_ORIGIN}/embed/${encodeURIComponent(libraryId)}/${encodeURIComponent(videoId)}?autoplay=false&preload=true&muted=false`
