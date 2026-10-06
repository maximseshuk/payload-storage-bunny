import { describe, expect, it } from 'vitest'

import { getBunnyEmbedUrl } from '@/shared/streamEmbed.js'

describe('getBunnyEmbedUrl', () => {
  it('builds the player URL', () => {
    expect(getBunnyEmbedUrl(42, 'vid-1')).toBe(
      'https://iframe.mediadelivery.net/embed/42/vid-1?autoplay=false&preload=true&muted=false',
    )
  })

  it('encodes the video ID', () => {
    expect(getBunnyEmbedUrl(42, '../x?y#z')).toBe(
      'https://iframe.mediadelivery.net/embed/42/..%2Fx%3Fy%23z?autoplay=false&preload=true&muted=false',
    )
  })
})
