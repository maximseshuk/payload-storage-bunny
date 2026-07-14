import { getFlag, parseFlags } from '../../src/bin/flags.js'
import { mintEdgeUploadUrl, verifyEdgeUploadUrl } from '../../src/storage/clientUploads/edge/mint.js'
import { log } from '../helpers/shared/log.js'

const flags = parseFlags(process.argv.slice(2))

const scriptUrl = (getFlag(flags, 'script-url') ?? process.env.BUNNY_EDGE_SCRIPT_URL ?? '').replace(/\/+$/, '')
const secret = getFlag(flags, 'secret') ?? process.env.BUNNY_EDGE_SECRET ?? ''
const zone = getFlag(flags, 'storage-zone') ?? process.env.BUNNY_STORAGE_ZONE_NAME ?? ''
const password = getFlag(flags, 'storage-key') ?? process.env.BUNNY_STORAGE_API_KEY ?? ''
const storageHost = getFlag(flags, 'storage-host') ?? 'storage.bunnycdn.com'

if (!scriptUrl || !secret || !zone || !password) {
  log.error('Need script-url, secret, storage-zone, storage-key (flags or BUNNY_EDGE_* / BUNNY_STORAGE_* env).')
  process.exit(1)
}

let failures = 0
const check = (label: string, ok: boolean, detail = ''): void => {
  const line = detail ? `${label} — ${detail}` : label
  if (ok) {
    log.success(line)
  } else {
    log.error(line)
    failures++
  }
}

const main = async (): Promise<void> => {
  const key = `edge-verify/hello-${Date.now()}.txt`
  const payload = `edge upload at ${new Date().toISOString()}`

  const url = mintEdgeUploadUrl({ maxSize: 1_000_000, path: key, scriptUrl, secret })
  check('local signature verifies', verifyEdgeUploadUrl(url, secret).valid)

  const put = await fetch(url, { body: payload, headers: { 'Content-Type': 'text/plain' }, method: 'PUT' })
  check('signed PUT through edge accepted', put.ok, `status ${put.status}`)
  if (put.body) {
    await put.text().catch(() => undefined)
  }

  const get = await fetch(`https://${storageHost}/${zone}/${key}`, { headers: { AccessKey: password } })
  const got = get.ok ? await get.text() : ''
  check('object readable from storage', get.ok, `status ${get.status}`)
  check('stored bytes match uploaded bytes', got === payload)

  const unsignedUrl = `${scriptUrl}/upload?X-Upload-Path=${encodeURIComponent(key)}&X-Upload-Max-Size=1000000&X-Upload-Expires=${Date.now() + 60000}`
  const unsigned = await fetch(unsignedUrl, { body: 'nope', headers: { 'Content-Type': 'text/plain' }, method: 'PUT' })
  check('unsigned PUT rejected', unsigned.status === 401, `status ${unsigned.status}`)
  if (unsigned.body) {
    await unsigned.text().catch(() => undefined)
  }

  const del = await fetch(`https://${storageHost}/${zone}/${key}`, {
    headers: { AccessKey: password },
    method: 'DELETE',
  })
  check('cleanup delete', del.ok || del.status === 404, `status ${del.status}`)

  if (failures === 0) {
    log.success('all edge checks passed')
  } else {
    log.error(`${failures} check(s) failed`)
  }
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  log.error(`Edge verification error: ${(err as Error).message}`)
  process.exit(1)
})
