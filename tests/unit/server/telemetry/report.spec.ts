import { describe, expect, it } from 'vitest'

import { buildReport } from '@/server/telemetry/report.js'
import type { TelemetryFeatures } from '@/server/telemetry/types.js'

const features: TelemetryFeatures = {
  accountApiKey: false,
  cdnPurge: false,
  collectionOverrides: false,
  collectionZones: false,
  signedUrls: false,
  signedUrlsCountryLock: false,
  storage: true,
  storageClientUploads: false,
  storageClientUploadsEdge: false,
  storageS3: false,
  stream: false,
  streamCleanup: false,
  streamTus: false,
  streamTusAutoMode: false,
  streamWebhook: false,
  thumbnail: false,
  urlTransform: false,
}

describe('buildReport', () => {
  const report = buildReport({
    features,
    payloadVersion: '3.86.0',
    productVersion: '3.1.0',
    projectId: 'abc123',
    projectIdSource: 'git',
  })

  it('matches the wire contract', () => {
    expect(report).toMatchObject({
      features,
      payloadVersion: '3.86.0',
      product: 'payload-storage-bunny',
      productVersion: '3.1.0',
      projectId: 'abc123',
      projectIdSource: 'git',
      runtime: 'node',
      schema: 1,
    })
  })

  it('derives runtimeVersion (node major) and a short lowercase os', () => {
    expect(report.runtimeVersion).toBe(process.versions.node.split('.')[0])
    expect(report.os).toBe(process.platform.toLowerCase())
    expect(report.os.length).toBeLessThanOrEqual(16)
  })
})
