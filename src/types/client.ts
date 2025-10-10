// Stream
export enum BunnyStreamVideoStatus {
  Created = 0,
  Error = 5,
  Finished = 4,
  JitPlaylistsCreated = 8,
  JitSegmenting = 7,
  Processing = 2,
  Transcoding = 3,
  Uploaded = 1,
  UploadFailed = 6,
}

export interface BunnyStreamVideoDocumentMeta {
  collectionId?: string
  resolutions?: {
    available?: string[]
    highest?: string
  }
}

export interface StreamVideoFromDocument {
  docId: number | string
  videoId: string
  videoMeta: BunnyStreamVideoDocumentMeta | null
}

export interface BunnyStreamVideoResolutionsResponse {
  data: BunnyStreamVideoResolutions
  message: null | string
  statusCode: number
  success: boolean
}

export interface BunnyStreamVideoResolutions {
  availableResolutions: null | string[]
  configuredResolutions: null | string[]
  hasBothOldAndNewResolutionFormat: boolean
  hasOriginal: boolean
  mp4Resolutions: {
    path: null | string
    resolution: null | string
  }[] | null
  oldResolutions: {
    checksum: null | string
    contentType: null | string
    dateCreated: string
    guid: null | string
    isDirectory: boolean
    lastChanged: string
    length: number
    objectName: null | string
    path: null | string
    replicatedZones: null | string
    serverId: number
    storageZoneId: number
    storageZoneName: null | string
    userId: null | string
  }[] | null
  playlistResolutions: {
    path: null | string
    resolution: null | string
  }[] | null
  storageObjects: {
    checksum: null | string
    contentType: null | string
    dateCreated: string
    guid: null | string
    isDirectory: boolean
    lastChanged: string
    length: number
    objectName: null | string
    path: null | string
    replicatedZones: null | string
    serverId: number
    storageZoneId: number
    storageZoneName: null | string
    userId: null | string
  }[] | null
  storageResolutions: {
    path: null | string
    resolution: null | string
  }[] | null
  videoId: null | string
  videoLibraryId: number
}

export interface BunnyStreamVideo {
  availableResolutions: null | string
  averageWatchTime: number
  captions: {
    label: null | string
    srclang: null | string
    version: number
  }[] | null
  category: null | string
  chapters: {
    end: number
    start: number
    title: string
  }[] | null
  collectionId: null | string
  dateUploaded: string
  description: null | string
  encodeProgress: number
  framerate: number
  guid: string
  hasMP4Fallback: boolean
  height: number
  isPublic: boolean
  jitEncodingEnabled: boolean | null
  length: number
  metaTags: {
    property: null | string
    value: null | string
  }[] | null
  moments: {
    label: string
    timestamp: number
  }[] | null
  outputCodecs: null | string
  rotation: null | number
  status: BunnyStreamVideoStatus
  storageSize: number
  thumbnailCount: number
  thumbnailFileName: null | string
  title: null | string
  totalWatchTime: number
  transcodingMessages: {
    issueCode: number
    level: number
    message: null | string
    timeStamp: string
    value: null | string
  }[] | null
  videoLibraryId: number
  views: number
  width: number
}
