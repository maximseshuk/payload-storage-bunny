export type ProjectIdSource = 'cwd' | 'git' | 'packageJSON' | 'serverURL'

export type TelemetryFeatures = {
  accountApiKey: boolean
  cdnPurge: boolean
  collectionOverrides: boolean
  collectionZones: boolean
  signedUrls: boolean
  signedUrlsCountryLock: boolean
  storage: boolean
  storageClientUploads: boolean
  storageClientUploadsEdge: boolean
  storageS3: boolean
  stream: boolean
  streamCleanup: boolean
  streamTus: boolean
  streamTusAutoMode: boolean
  streamWebhook: boolean
  thumbnail: boolean
  urlTransform: boolean
}

export type TelemetryReport = {
  features: TelemetryFeatures
  os: string
  payloadVersion: string
  product: string
  productVersion: string
  projectId: string
  projectIdSource: ProjectIdSource
  runtime: 'node'
  runtimeVersion: string
  schema: number
}
