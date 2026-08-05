import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { openApiDocument } from '../src/server/payload/openapi.js'

const outPath = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/api-reference/openapi.json')
writeFileSync(outPath, `${JSON.stringify(openApiDocument, null, 2)}\n`)

// eslint-disable-next-line no-console
console.log(`Wrote OpenAPI schema → ${outPath}`)
