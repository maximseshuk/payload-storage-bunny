import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { BUNNY_API } from '@/shared/constants.js'

import { cleanupStreamVideos, waitForVideoProcessed } from '../../helpers/e2e/bunnyStream.js'
import { recordResponses, waitForFormReady } from '../../helpers/e2e/interactions.js'
import { getServerUrl } from '../../helpers/e2e/server.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const serverUrl = getServerUrl()

const VERCEL_BODY_LIMIT = 4_500_000

const smallVideo = fs.readFileSync(path.join(__dirname, '../../fixtures/test-video.mp4'))

const largeVideo = (() => {
  const mp4FreeBox = Buffer.alloc(VERCEL_BODY_LIMIT)
  mp4FreeBox.writeUInt32BE(mp4FreeBox.length, 0)
  mp4FreeBox.write('free', 4, 'ascii')
  return Buffer.concat([smallVideo, mp4FreeBox])
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

const bulkAltField = (page: Page) => page.locator('.bulk-upload--file-manager input[name="alt"]')

const saveBulkUpload = async (page: Page): Promise<void> => {
  await bulkAltField(page).fill('Bulk video')
  await page.locator('.bulk-upload--actions-bar__saveButtons').getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.payload-toast-container')).toContainText('Successfully saved 1 files', {
    timeout: 120000,
  })
}

const isTusUpload = ({ url }: { url: string }): boolean => url.startsWith(BUNNY_API.TUS_ENDPOINT)

const expectStreamDoc = async (
  page: Page,
  name: string,
  { collection = 'stream-direct', size = largeVideo.length, uploaded = false } = {},
): Promise<void> => {
  const filename = `${name}-original.mp4`
  const response = await page.request.get(`${serverUrl}/api/${collection}?where[filename][equals]=${filename}`)
  const [doc] = (await response.json()).docs
  const videoId = doc?.bunnyData?.stream?.videoId

  expect(videoId).toBeTruthy()
  expect(doc.mimeType).toBe('video/mp4')
  expect(doc.filesize).toBe(size)
  if (collection === 'stream-direct') {
    expect(doc._objectKey).toBe(videoId)
  }

  if (uploaded) {
    expect(await waitForVideoProcessed(videoId, { timeout: 60000, until: 'uploaded' })).toBe(true)
  }

  await page.request.delete(`${serverUrl}/api/${collection}/${doc.id}`)
}

const openBulkUpload = async (page: Page, collection: string) => {
  await page.goto(`${serverUrl}/admin/collections/${collection}`)
  const fileInput = page.locator('.bulk-upload--add-files .upload-dropzone-content__hidden-input')
  await expect(async () => {
    await page.getByRole('button', { name: 'Bulk Upload' }).click({ timeout: 5000 })
    await expect(fileInput).toBeAttached({ timeout: 5000 })
  }).toPass({ timeout: 60000 })
  return fileInput
}

test.afterAll(async () => {
  await cleanupStreamVideos(['stream-bulk-'])
})

test.describe('Stream bulk upload behind a request body limit', () => {
  test.setTimeout(5 * 60_000)

  test('uploads a video larger than the limit from the list view over TUS', async ({ page }) => {
    const responses = recordResponses(page)

    const fileInput = await openBulkUpload(page, 'stream-direct')
    await fileInput.setInputFiles({
      buffer: largeVideo,
      mimeType: 'video/mp4',
      name: 'stream-bulk-list.mp4',
    })

    await saveBulkUpload(page)

    expect(responses.filter((response) => response.status === 413)).toEqual([])
    expect(responses.some(isTusUpload)).toBe(true)
    await expectStreamDoc(page, 'stream-bulk-list', { uploaded: true })
  })

  test('uploads a video through Payload in a collection with upload.mimeTypes', async ({ page }) => {
    const responses = recordResponses(page)

    const fileInput = await openBulkUpload(page, 'stream-only')
    await fileInput.setInputFiles({
      buffer: smallVideo,
      mimeType: 'video/mp4',
      name: 'stream-bulk-server.mp4',
    })

    await saveBulkUpload(page)

    expect(responses.some(isTusUpload)).toBe(false)
    await expectStreamDoc(page, 'stream-bulk-server', { collection: 'stream-only', size: smallVideo.length })
  })

  test('uploads a video dropped on an upload field over TUS', async ({ page }) => {
    const responses = recordResponses(page)

    await page.goto(`${serverUrl}/admin/collections/posts/create`)
    await waitForFormReady(page)
    await dropLargeVideo(page, 'stream-bulk-drop.mp4')

    await saveBulkUpload(page)
    await expect(page.getByText('stream-bulk-drop-original.mp4')).toBeVisible()

    expect(responses.filter((response) => response.status === 413)).toEqual([])
    expect(responses.some(isTusUpload)).toBe(true)
    await expectStreamDoc(page, 'stream-bulk-drop')
  })

  test('uploads a video over TUS on a plain form save without TUS mode', async ({ page }) => {
    const responses = recordResponses(page)

    await page.goto(`${serverUrl}/admin/collections/stream-direct/create`)
    await waitForFormReady(page)

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.click('text=Select a file')
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles({ buffer: largeVideo, mimeType: 'video/mp4', name: 'stream-bulk-form.mp4' })

    await page.locator('#field-alt').fill('Form video')
    await page.click('#action-save')
    await expect(page.locator('.payload-toast-container')).toContainText('successfully', { timeout: 120000 })

    expect(responses.filter((response) => response.status === 413)).toEqual([])
    expect(responses.some(isTusUpload)).toBe(true)
    await expectStreamDoc(page, 'stream-bulk-form')
  })

  test('keeps TUS mode in the create drawer after the bulk drawer closes', async ({ page }) => {
    await page.goto(`${serverUrl}/admin/collections/posts/create`)
    await waitForFormReady(page)
    await dropLargeVideo(page, 'stream-bulk-discarded.mp4')

    await expect(bulkAltField(page)).toBeVisible()
    await page.locator('.bulk-upload--file-manager .dialog__header').getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Leave anyway' }).click()
    await expect(bulkAltField(page)).toBeHidden()

    await page.getByRole('button', { name: 'Create New' }).click()
    await expect(page.getByRole('button', { name: 'Enable TUS mode' })).toBeVisible()
  })
})
