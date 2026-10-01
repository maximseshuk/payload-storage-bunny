import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  deleteDocAndAssert,
  recordResponses,
  saveDocAndAssert,
  waitForFormReady,
} from '../../helpers/e2e/interactions.js'
import { getServerUrl } from '../../helpers/e2e/server.js'
import { hasClientUploadsEdgeCredentials, hasS3StorageCredentials } from '../../helpers/shared/credentials.js'

const image = readFileSync(path.join(process.cwd(), 'tests/fixtures/test-image.jpg'))

const serverUrl = getServerUrl()

const uploadDirect = async (page: Page, slug: string, directHost: string): Promise<void> => {
  const responses = recordResponses(page)

  await page.goto(`${serverUrl}/admin/collections/${slug}/create`)
  await waitForFormReady(page)

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.click('text=Select a file')
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles({ buffer: image, mimeType: 'image/jpeg', name: `test-image-${Date.now()}.jpg` })

  await page.fill('#field-alt', `${slug} client upload`)
  await saveDocAndAssert(page, '#action-save', 'success', { timeout: 30_000 })

  const mint = responses.find((r) => r.method === 'POST' && r.url.includes('/api/upload-instructions'))
  const directPut = responses.find((r) => r.method === 'PUT' && r.url.includes(directHost))
  expect(mint?.status).toBe(200)
  expect(directPut?.status).toBeGreaterThanOrEqual(200)
  expect(directPut?.status).toBeLessThan(400)

  const docId = page.url().match(new RegExp(`/${slug}/([^/?]+)`))?.[1]
  const doc = await (await page.request.get(`${serverUrl}/api/${slug}/${docId}`)).json()
  const served = await page.request.get(new URL(doc.url, serverUrl).href)
  expect(served.status()).toBe(200)
  expect(served.headers()['content-type']).toContain('image/jpeg')

  await deleteDocAndAssert(page)
}

test.describe('Client uploads', () => {
  test('edge: bytes go browser → edge script, not through Payload', async ({ page }) => {
    test.skip(!hasClientUploadsEdgeCredentials(), 'Requires BUNNY_STORAGE_* and BUNNY_EDGE_*')
    await uploadDirect(page, 'client-uploads-edge', new URL(process.env.BUNNY_EDGE_SCRIPT_URL as string).host)
  })

  test('s3: bytes go browser → S3 endpoint via presigned PUT, not through Payload', async ({ page }) => {
    test.skip(!hasS3StorageCredentials(), 'Requires BUNNY_S3_STORAGE_* (an S3-compatible zone)')
    await uploadDirect(page, 'client-uploads-s3', `${process.env.BUNNY_S3_STORAGE_REGION}-s3.storage.bunnycdn.com`)
  })
})
