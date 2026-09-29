import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { cleanupStreamVideos, waitForVideoProcessed } from '../../helpers/e2e/bunnyStream.js'
import { recordResponses } from '../../helpers/e2e/interactions.js'
import { getServerUrl } from '../../helpers/e2e/server.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const serverUrl = getServerUrl()

const VERCEL_BODY_LIMIT = 4_500_000

const largeVideo = (() => {
  const video = fs.readFileSync(path.join(__dirname, '../../fixtures/test-video.mp4'))
  const mp4FreeBox = Buffer.alloc(VERCEL_BODY_LIMIT)
  mp4FreeBox.writeUInt32BE(mp4FreeBox.length, 0)
  mp4FreeBox.write('free', 4, 'ascii')
  return Buffer.concat([video, mp4FreeBox])
})()

const dropLargeVideo = async (page: Page, filename: string): Promise<void> => {
  const dataTransfer = await page.evaluateHandle(
    ({ base64, name }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], name, { type: 'video/mp4' }))
      return transfer
    },
    { base64: largeVideo.toString('base64'), name: filename },
  )

  await page.locator('.dropzone').first().dispatchEvent('drop', { dataTransfer })
}

const saveBulkUpload = async (page: Page): Promise<void> => {
  await page.locator('#field-alt').fill('Bulk video')
  await page.locator('.bulk-upload--actions-bar__saveButtons').getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.payload-toast-container')).toContainText('Successfully saved 1 files', {
    timeout: 120000,
  })
}

const expectStreamDoc = async (page: Page, filename: string, { uploaded = false } = {}): Promise<void> => {
  const response = await page.request.get(`${serverUrl}/api/stream-only?where[filename][equals]=${filename}`)
  const [doc] = (await response.json()).docs

  expect(doc?.bunnyData?.stream?.videoId).toBeTruthy()
  expect(doc.mimeType).toBe('video/mp4')
  expect(doc.filesize).toBe(largeVideo.length)

  if (uploaded) {
    expect(await waitForVideoProcessed(doc.bunnyData.stream.videoId, { timeout: 60000, until: 'uploaded' })).toBe(true)
  }

  await page.request.delete(`${serverUrl}/api/stream-only/${doc.id}`)
}

test.afterAll(async () => {
  await cleanupStreamVideos(['stream-bulk-'])
})

test.describe('Stream - bulk upload behind a request body limit', () => {
  test.setTimeout(600000)

  test('uploads a video larger than the limit from the list view', async ({ page }) => {
    const responses = recordResponses(page)

    await page.goto(`${serverUrl}/admin/collections/stream-only`)
    await page.getByRole('button', { name: 'Bulk Upload' }).click()
    await page.locator('.bulk-upload--add-files__hidden-input').setInputFiles({
      buffer: largeVideo,
      mimeType: 'video/mp4',
      name: 'stream-bulk-list.mp4',
    })

    await saveBulkUpload(page)

    expect(responses.filter((response) => response.status === 413)).toEqual([])
    await expectStreamDoc(page, 'stream-bulk-list.mp4', { uploaded: true })
  })

  test('uploads a video dropped on an upload field', async ({ page }) => {
    const responses = recordResponses(page)

    await page.goto(`${serverUrl}/admin/collections/posts/create`)
    await page.waitForLoadState('networkidle')
    await dropLargeVideo(page, 'stream-bulk-drop.mp4')

    await saveBulkUpload(page)
    await expect(page.getByText('stream-bulk-drop.mp4')).toBeVisible()

    expect(responses.filter((response) => response.status === 413)).toEqual([])
    await expectStreamDoc(page, 'stream-bulk-drop.mp4')
  })

  test('uploads a video on a plain form save without TUS mode', async ({ page }) => {
    const responses = recordResponses(page)

    await page.goto(`${serverUrl}/admin/collections/stream-only/create`)
    await page.waitForLoadState('networkidle')

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.click('text=Select a file')
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles({ buffer: largeVideo, mimeType: 'video/mp4', name: 'stream-bulk-form.mp4' })

    await page.locator('#field-alt').fill('Form video')
    await page.click('#action-save')
    await expect(page.locator('.payload-toast-container')).toContainText('successfully', { timeout: 120000 })

    expect(responses.filter((response) => response.status === 413)).toEqual([])
    await expectStreamDoc(page, 'stream-bulk-form.mp4')
  })

  test('keeps TUS mode in the create drawer after the bulk drawer closes', async ({ page }) => {
    await page.goto(`${serverUrl}/admin/collections/posts/create`)
    await page.waitForLoadState('networkidle')
    await dropLargeVideo(page, 'stream-bulk-discarded.mp4')

    await expect(page.locator('#field-alt')).toBeVisible()
    await page.locator('.bulk-upload--actions-bar').locator('..').locator('.drawer-close-button').first().click()
    const leaveAnyway = page.getByRole('button', { name: 'Leave anyway' })
    if (await leaveAnyway.isVisible()) {
      await leaveAnyway.click()
    }
    await expect(page.locator('#field-alt')).toBeHidden()

    await page.getByRole('button', { name: 'Create New' }).click()
    await expect(page.getByRole('button', { name: 'Enable tus mode' })).toBeVisible()
  })
})
