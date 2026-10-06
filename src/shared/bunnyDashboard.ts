export const getBunnyStreamDashboardUrl = (libraryId: number | string, videoId: string): string =>
  `https://dash.bunny.net/stream/${encodeURIComponent(libraryId)}/library/overview?vid=${encodeURIComponent(videoId)}`
