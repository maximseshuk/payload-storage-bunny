import { cac } from 'cac'

import { mintEdgeUploadUrl, verifyEdgeUploadUrl } from '../../src/storage/clientUploads/edge/mint.js'
import { log } from '../helpers/shared/log.js'

const arg = (value: unknown): string | undefined => (value === undefined ? undefined : String(value))

const cli = cac('pnpm test:verify-edge')
cli.option('--script-url <url>', 'Edge Script URL (defaults to BUNNY_EDGE_SCRIPT_URL).')
cli.option('--secret <secret>', 'Shared secret (defaults to BUNNY_EDGE_SECRET).')
cli.option('--storage-zone <name>', 'Storage zone name (defaults to BUNNY_STORAGE_ZONE_NAME).')
cli.option('--storage-key <key>', 'Storage zone password (defaults to BUNNY_STORAGE_API_KEY).')
cli.option('--storage-host <host>', 'Storage host (default: storage.bunnycdn.com).')
cli.help()
cli.parse(['', '', ...process.argv.slice(2)], { run: false })
if (cli.options.help) {
  process.exit(0)
}
const options = cli.options

const scriptUrl = (arg(options.scriptUrl) ?? process.env.BUNNY_EDGE_SCRIPT_URL ?? '').replace(/\/+$/, '')
const secret = arg(options.secret) ?? process.env.BUNNY_EDGE_SECRET ?? ''
const zone = arg(options.storageZone) ?? process.env.BUNNY_STORAGE_ZONE_NAME ?? ''
const password = arg(options.storageKey) ?? process.env.BUNNY_STORAGE_API_KEY ?? ''
const storageHost = arg(options.storageHost) ?? 'storage.bunnycdn.com'

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

  const url = mintEdgeUploadUrl({ maxSize: 1_000_000, path: key, scriptUrl, secret, zoneName: zone })
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

  const unknownZoneUrl = mintEdgeUploadUrl({
    maxSize: 1_000_000,
    path: key,
    scriptUrl,
    secret,
    zoneName: `no-such-zone-${Date.now()}`,
  })
  const unknownZone = await fetch(unknownZoneUrl, {
    body: 'nope',
    headers: { 'Content-Type': 'text/plain' },
    method: 'PUT',
  })
  check('validly-signed URL for an unmapped zone rejected', unknownZone.status === 403, `status ${unknownZone.status}`)
  if (unknownZone.body) {
    await unknownZone.text().catch(() => undefined)
  }

  const swappedZoneUrl = url.replace(`X-Upload-Zone=${encodeURIComponent(zone)}`, 'X-Upload-Zone=swapped')
  const swappedZone = await fetch(swappedZoneUrl, {
    body: 'nope',
    headers: { 'Content-Type': 'text/plain' },
    method: 'PUT',
  })
  check(
    'URL with the zone param swapped after minting rejected',
    swappedZone.status === 401,
    `status ${swappedZone.status}`,
  )
  if (swappedZone.body) {
    await swappedZone.text().catch(() => undefined)
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
