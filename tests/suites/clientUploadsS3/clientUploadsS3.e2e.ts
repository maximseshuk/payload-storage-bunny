import path from 'node:path'

import { expect, test } from '@playwright/test'

import { deleteDocAndAssert, recordResponses, saveDocAndAssert } from '../../helpers/e2e/interactions.js'
import { getServerUrl } from '../../helpers/e2e/server.js'
import { hasS3StorageCredentials } from '../../helpers/shared/credentials.js'

const fixturesDir = path.join(process.cwd(), 'tests/fixtures')

test.describe('Client Uploads - S3 mode', () => {
  test.skip(!hasS3StorageCredentials(), 'Requires BUNNY_S3_STORAGE_* (an S3-compatible zone)')

  const serverUrl = getServerUrl()
  const s3Host = `${process.env.BUNNY_S3_STORAGE_REGION || 'de'}-s3.storage.bunnycdn.com`

  test('bytes go browser → S3 endpoint via presigned PUT, not through Payload', async ({ page }) => {
    const responses = recordResponses(page)

    await page.goto(`${serverUrl}/admin/collections/client-uploads-s3/create`)
    await page.waitForLoadState('networkidle')

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.click('text=Select a file')
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(path.join(fixturesDir, 'test-image.jpg'))

    await page.fill('#field-alt', 'S3 client upload')
    await saveDocAndAssert(page)

    const mint = responses.find((r) => r.method === 'POST' && r.url.includes('/storage-bunny/storage/upload'))
    const directPut = responses.find((r) => r.method === 'PUT' && r.url.includes(s3Host))
    expect(mint?.status).toBe(200)
    expect(directPut?.status).toBeGreaterThanOrEqual(200)
    expect(directPut?.status).toBeLessThan(400)

    await deleteDocAndAssert(page)
  })
})
