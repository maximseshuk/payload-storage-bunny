import path from 'node:path'

import { expect, test } from '@playwright/test'

import { deleteDocAndAssert, recordResponses, saveDocAndAssert } from '../../helpers/e2e/interactions.js'
import { getServerUrl } from '../../helpers/e2e/server.js'
import { hasClientUploadsEdgeCredentials } from '../../helpers/shared/credentials.js'

const fixturesDir = path.join(process.cwd(), 'tests/fixtures')

test.describe('Client Uploads - Edge mode', () => {
  test.skip(!hasClientUploadsEdgeCredentials(), 'Requires BUNNY_STORAGE_* and BUNNY_EDGE_*')

  const serverUrl = getServerUrl()
  const scriptHost = process.env.BUNNY_EDGE_SCRIPT_URL ? new URL(process.env.BUNNY_EDGE_SCRIPT_URL).host : ''

  test('bytes go browser → edge script, not through Payload', async ({ page }) => {
    const responses = recordResponses(page)

    await page.goto(`${serverUrl}/admin/collections/client-uploads-edge/create`)
    await page.waitForLoadState('networkidle')

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.click('text=Select a file')
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(path.join(fixturesDir, 'test-image.jpg'))

    await page.fill('#field-alt', 'Edge client upload')
    await saveDocAndAssert(page)

    const mint = responses.find((r) => r.method === 'POST' && r.url.includes('/storage-bunny/storage/upload'))
    const directPut = responses.find((r) => r.method === 'PUT' && r.url.includes(scriptHost))
    expect(mint?.status).toBe(200)
    expect(directPut?.status).toBeGreaterThanOrEqual(200)
    expect(directPut?.status).toBeLessThan(400)

    await deleteDocAndAssert(page)
  })
})
