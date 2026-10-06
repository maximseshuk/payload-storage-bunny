import { describe, expect, it } from 'vitest'

import { getBunnyStreamDashboardUrl } from '@/shared/bunnyDashboard.js'

describe('getBunnyStreamDashboardUrl', () => {
  it('builds the Bunny Stream dashboard URL of a video', () => {
    expect(getBunnyStreamDashboardUrl(703889, '66e02a18-80c1-407a-9c1c-ec8ad13c87a7')).toBe(
      'https://dash.bunny.net/stream/703889/library/overview?vid=66e02a18-80c1-407a-9c1c-ec8ad13c87a7',
    )
  })

  it('encodes the video ID', () => {
    expect(getBunnyStreamDashboardUrl('12', 'a b&c=d')).toBe(
      'https://dash.bunny.net/stream/12/library/overview?vid=a%20b%26c%3Dd',
    )
  })
})
