import type { CollectionContext } from '@/shared/types/index.js'

export const hasStreamClientUploads = (context: CollectionContext): boolean =>
  context.isTusUploadSupported && (!context.storageOptions || !!context.storageOptions.clientUploads)

const ISO_BOX_HEADER_SIZE = 8
const MIN_ISO_FILE_SIZE = 24
const ISO_FIRST_BOX_TYPES = new Set(['free', 'ftyp', 'mdat', 'moov', 'wide'])

const isoBox = (type: string, payload: Buffer = Buffer.alloc(0)): Buffer<ArrayBuffer> => {
  const box = Buffer.alloc(ISO_BOX_HEADER_SIZE + payload.length)
  box.writeUInt32BE(box.length, 0)
  box.write(type, 4, 'latin1')
  payload.copy(box, ISO_BOX_HEADER_SIZE)
  return box
}

const minimalFirstBox = (head: Buffer, type: string): Buffer<ArrayBuffer> => {
  if (type !== 'ftyp') {
    return isoBox(type)
  }
  const brandOffset = head.readUInt32BE(0) === 1 ? 16 : ISO_BOX_HEADER_SIZE
  const brand = Buffer.alloc(8)
  head.copy(brand, 0, brandOffset, brandOffset + brand.length)
  return isoBox('ftyp', brand)
}

export const trimToCompleteIsoBoxes = (head: Buffer<ArrayBuffer>): Buffer<ArrayBuffer> => {
  const firstBoxType = head.length >= ISO_BOX_HEADER_SIZE ? head.toString('latin1', 4, 8) : ''
  if (!ISO_FIRST_BOX_TYPES.has(firstBoxType)) {
    return head
  }

  let end = 0
  while (end + ISO_BOX_HEADER_SIZE <= head.length) {
    const boxSize = head.readUInt32BE(end)
    if (boxSize < ISO_BOX_HEADER_SIZE || end + boxSize > head.length) {
      break
    }
    end += boxSize
  }

  const boxes = end > 0 ? head.subarray(0, end) : minimalFirstBox(head, firstBoxType)
  const padding = isoBox('free', Buffer.alloc(Math.max(0, MIN_ISO_FILE_SIZE - boxes.length - ISO_BOX_HEADER_SIZE)))
  return Buffer.concat([boxes, padding])
}
