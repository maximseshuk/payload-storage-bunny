import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const EDGE_SCRIPT_BODY = readFileSync(fileURLToPath(new URL('./uploader.edge.js', import.meta.url)), 'utf8')

export const EDGE_SCRIPT_VERSION = createHash('sha256').update(EDGE_SCRIPT_BODY).digest('hex').slice(0, 12)

export const EDGE_SCRIPT_SOURCE = EDGE_SCRIPT_BODY.replace('__PSB_EDGE_VERSION__', EDGE_SCRIPT_VERSION)
