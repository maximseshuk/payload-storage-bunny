import type { PayloadRequest } from 'payload'

import sanitize from 'sanitize-filename'

import { fileExists } from './file.js'

type DocWithFilenameExistsArgs = {
  collectionSlug: string
  filename: string
  path: string
  req: PayloadRequest
}

// Function taken from:
// @https://github.com/payloadcms/payload/blob/main/packages/payload/src/uploads/docWithFilenameExists.ts
export const docWithFilenameExists = async ({
  collectionSlug,
  filename,
  req,
}: DocWithFilenameExistsArgs): Promise<boolean> => {
  const doc = await req.payload.db.findOne({
    collection: collectionSlug,
    req,
    where: {
      filename: {
        equals: filename,
      },
    },
  })
  if (doc) {
    return true
  }

  return false
}

// Function taken from:
// @https://github.com/payloadcms/payload/blob/main/packages/payload/src/uploads/getSafeFileName.ts
const incrementName = (name: string) => {
  const extension = name.split('.').pop()
  const baseFilename = sanitize(name.substring(0, name.lastIndexOf('.')) || name)
  let incrementedName = baseFilename
  const regex = /(.*)-(\d+)$/
  const found = baseFilename.match(regex)
  if (found === null) {
    incrementedName += '-1'
  } else {
    const matchedName = found[1]
    const matchedNumber = found[2]
    const incremented = Number(matchedNumber) + 1
    incrementedName = `${matchedName}-${incremented}`
  }
  return `${incrementedName}.${extension}`
}

type GetSafeFileNameArgs = {
  collectionSlug: string
  desiredFilename: string
  req: PayloadRequest
  staticPath: string
}

// Function taken from:
// @https://github.com/payloadcms/payload/blob/main/packages/payload/src/uploads/getSafeFileName.ts
export async function getSafeFileName({
  collectionSlug,
  desiredFilename,
  req,
  staticPath,
}: GetSafeFileNameArgs): Promise<string> {
  let modifiedFilename = desiredFilename

  while (
    (await docWithFilenameExists({
      collectionSlug,
      filename: modifiedFilename,
      path: staticPath,
      req,
    })) ||
    (await fileExists(`${staticPath}/${modifiedFilename}`))
  ) {
    modifiedFilename = incrementName(modifiedFilename)
  }
  return modifiedFilename
}
