import { cac } from 'cac'
import { S3mini } from 's3mini'

import {
  deleteStorageFileS3,
  getS3Endpoint,
  presignStoragePutUrl,
  uploadStorageFileS3,
} from '../../src/server/bunny/s3.js'
import { log } from '../helpers/shared/log.js'

const arg = (value: unknown): string | undefined => (value === undefined ? undefined : String(value))

const cli = cac('pnpm test:verify-s3')
cli.option('--storage-zone <name>', 'S3 storage zone name (defaults to BUNNY_S3_STORAGE_ZONE_NAME).')
cli.option('--storage-key <key>', 'S3 storage zone password (defaults to BUNNY_S3_STORAGE_API_KEY).')
cli.option('--region <region>', 'S3 region (defaults to BUNNY_S3_STORAGE_REGION).')
cli.help()
cli.parse(['', '', ...process.argv.slice(2)], { run: false })
if (cli.options.help) {
  process.exit(0)
}
const options = cli.options

const zoneName = arg(options.storageZone) ?? process.env.BUNNY_S3_STORAGE_ZONE_NAME ?? ''
const apiKey = arg(options.storageKey) ?? process.env.BUNNY_S3_STORAGE_API_KEY ?? ''
const region = arg(options.region) ?? process.env.BUNNY_S3_STORAGE_REGION ?? ''

if (!zoneName || !apiKey || !region) {
  log.error('Need BUNNY_S3_STORAGE_ZONE_NAME, BUNNY_S3_STORAGE_API_KEY, BUNNY_S3_STORAGE_REGION (or flags).')
  process.exit(1)
}

const s3 = { region }
const reader = new S3mini({
  accessKeyId: zoneName,
  endpoint: `${getS3Endpoint(region)}/${zoneName}`,
  region,
  secretAccessKey: apiKey,
})

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
  const stamp = Date.now()

  log.header('server backend (uploadStorageFileS3 / deleteStorageFileS3)')
  const serverPath = `s3-verify/server-${stamp}.txt`
  const serverPayload = `server upload ${stamp}`
  await uploadStorageFileS3({
    apiKey,
    buffer: Buffer.from(serverPayload),
    mimeType: 'text/plain',
    path: serverPath,
    s3,
    zoneName,
  })
  check('uploadStorageFileS3 succeeded', true)
  check('object exists after upload', (await reader.objectExists(serverPath)) === true)
  check('bytes match', (await reader.getObject(serverPath)) === serverPayload)
  await deleteStorageFileS3({ apiKey, path: serverPath, s3, zoneName })
  check('object gone after deleteStorageFileS3', (await reader.objectExists(serverPath)) === false)

  log.header('client upload (presignStoragePutUrl → direct PUT)')
  const clientPath = `s3-verify/client-${stamp}.txt`
  const clientPayload = `client upload ${stamp}`
  const url = await presignStoragePutUrl({ apiKey, path: clientPath, s3, zoneName })
  check('presigned URL is a Bunny S3 URL', url.startsWith(`${getS3Endpoint(region)}/${zoneName}/`), url.split('?')[0])
  const put = await fetch(url, { body: clientPayload, headers: { 'Content-Type': 'text/plain' }, method: 'PUT' })
  check('direct PUT to presigned URL accepted', put.ok, `status ${put.status}`)
  if (put.body) {
    await put.text().catch(() => undefined)
  }
  check('presigned object bytes match', (await reader.getObject(clientPath)) === clientPayload)
  await deleteStorageFileS3({ apiKey, path: clientPath, s3, zoneName })
  check('presigned object cleaned up', (await reader.objectExists(clientPath)) === false)

  if (failures === 0) {
    log.success('all S3 checks passed')
  } else {
    log.error(`${failures} check(s) failed`)
  }
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  log.error(`S3 verification error: ${(err as Error).message}`)
  process.exit(1)
})
