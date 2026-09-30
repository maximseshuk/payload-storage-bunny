import { describe, expect, it } from 'vitest'

import { trimToCompleteIsoBoxes } from '@/server/payload/stream/clientUploads.js'

const box = (type: string, size: number, payload = Buffer.alloc(Math.max(0, size - 8))): Buffer<ArrayBuffer> => {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(size, 0)
  header.write(type, 4, 'latin1')
  return Buffer.concat([header, payload])
}

const ftyp = box('ftyp', 20, Buffer.from('isom\0\0\x02\0isom', 'latin1'))

const topLevelBoxes = (buffer: Buffer): string[] => {
  const types: string[] = []
  let position = 0
  while (position < buffer.length) {
    const size = buffer.readUInt32BE(position)
    types.push(`${buffer.toString('latin1', position + 4, position + 8)}:${size}`)
    position += size
  }
  expect(position).toBe(buffer.length)
  return types
}

describe('trimToCompleteIsoBoxes', () => {
  it('drops a truncated box and closes the file with a free box', () => {
    const truncatedMoov = box('moov', 5000).subarray(0, 4000)
    const result = trimToCompleteIsoBoxes(Buffer.concat([ftyp, truncatedMoov]))

    expect(topLevelBoxes(result)).toEqual(['ftyp:20', 'free:8'])
    expect(result.subarray(0, 20)).toEqual(ftyp)
  })

  it('keeps every complete box before the truncated one', () => {
    const free = box('free', 16)
    const truncatedMdat = box('mdat', 90000).subarray(0, 4000)
    const result = trimToCompleteIsoBoxes(Buffer.concat([ftyp, free, truncatedMdat]))

    expect(topLevelBoxes(result)).toEqual(['ftyp:20', 'free:16', 'free:8'])
  })

  it('treats a 64-bit box size as truncated', () => {
    const largeMdat = box('mdat', 1).subarray(0, 8)
    const result = trimToCompleteIsoBoxes(Buffer.concat([ftyp, largeMdat, Buffer.alloc(100)]))

    expect(topLevelBoxes(result)).toEqual(['ftyp:20', 'free:8'])
  })

  it('pads the free box so the file reaches the minimum ISO size', () => {
    const smallFtyp = box('ftyp', 16, Buffer.from('isom\0\0\x02\0', 'latin1'))
    const result = trimToCompleteIsoBoxes(Buffer.concat([smallFtyp, box('moov', 900).subarray(0, 100)]))

    expect(topLevelBoxes(result)).toEqual(['ftyp:16', 'free:8'])
    expect(result.length).toBe(24)
  })

  it('returns non-ISO heads unchanged', () => {
    const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42])

    expect(trimToCompleteIsoBoxes(webm)).toBe(webm)
  })

  it('keeps a QuickTime head that starts with a wide box', () => {
    const truncatedMdat = box('mdat', 90000).subarray(0, 4000)
    const result = trimToCompleteIsoBoxes(Buffer.concat([box('wide', 8), truncatedMdat]))

    expect(topLevelBoxes(result)).toEqual(['wide:8', 'free:16'])
  })

  it('rebuilds a minimal first box when none fits in the head', () => {
    const result = trimToCompleteIsoBoxes(box('moov', 9000).subarray(0, 4100))

    expect(topLevelBoxes(result)).toEqual(['moov:8', 'free:16'])
  })

  it('keeps the brand of a 64-bit ftyp box', () => {
    const header = Buffer.alloc(16)
    header.writeUInt32BE(1, 0)
    header.write('ftyp', 4, 'latin1')
    header.writeBigUInt64BE(9000n, 8)
    const head = Buffer.concat([header, Buffer.from('qt  \0\0\x02\0', 'latin1'), Buffer.alloc(100)])
    const result = trimToCompleteIsoBoxes(head)

    expect(topLevelBoxes(result)).toEqual(['ftyp:16', 'free:8'])
    expect(result.toString('latin1', 8, 12)).toBe('qt  ')
  })
})
