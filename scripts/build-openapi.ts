import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { openApiDocument } from '../src/server/payload/openapi.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }
const outPath = resolve(root, 'docs/v4/api-reference/openapi.json')
const document = { ...openApiDocument, info: { ...openApiDocument.info, version } }
writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`)

// eslint-disable-next-line no-console
console.log(`Wrote OpenAPI schema → ${outPath}`)
