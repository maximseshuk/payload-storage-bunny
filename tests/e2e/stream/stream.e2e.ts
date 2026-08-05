import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import { cleanupStreamVideos, waitForVideoProcessed } from '../../helpers/e2e/bunnyStream.js'
import { deleteDocAndAssert, saveDocAndAssert } from '../../helpers/e2e/interactions.js'
import { getServerUrl } from '../../helpers/e2e/server.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test.afterAll(async () => {
  await cleanupStreamVideos([
    'stream-auto-video',
    'stream-manual-video',
    'stream-resume-video',
    'stream-replace-first',
    'stream-replace-second',
  ])
})

test.describe('Stream - Upload and Delete (Auto Mode)', () => {
  const serverUrl = getServerUrl()
  const testVideoFilename = 'stream-auto-video.mp4'

  test('should upload and delete video', async ({ page }) => {
    await page.goto(`${serverUrl}/admin/collections/stream-auto/create`)
    await page.waitForLoadState('networkidle')

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.click('text=Select a file')
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(path.join(__dirname, '../../fixtures/test-video.mp4'))

    await page.waitForSelector('.storage-bunny-tus-upload', { timeout: 5000 })

    await page.fill('.storage-bunny-tus-upload__filename', testVideoFilename)

    const startUploadButton = page.locator('button:has-text("Start upload")')
    await expect(startUploadButton).toBeVisible({ timeout: 10000 })
    await startUploadButton.click()

    const uploadCompleted = page.locator('text=Upload completed successfully!')
    await expect(uploadCompleted).toBeVisible({ timeout: 60000 })

    await page.fill('#field-alt', 'Test video with auto TUS mode')

    await saveDocAndAssert(page)
    await deleteDocAndAssert(page)
  })
})

test.describe('Stream - TUS Manual Mode Upload', () => {
  const serverUrl = getServerUrl()
  const testVideoFilename = 'stream-manual-video.mp4'

  test('should manually enable TUS and upload video', async ({ page }) => {
    await page.goto(`${serverUrl}/admin/collections/stream-manual/create`)
    await page.waitForLoadState('networkidle')

    const enableTusButton = page.locator('button:has-text("Enable tus mode")')
    await expect(enableTusButton).toBeVisible({ timeout: 5000 })
    await enableTusButton.click()

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('.storage-bunny-tus-upload__dropzoneButtons').getByText('Select a file').click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(path.join(__dirname, '../../fixtures/test-video.mp4'))

    await page.waitForSelector('.storage-bunny-tus-upload', { timeout: 5000 })

    await page.fill('.storage-bunny-tus-upload__filename', testVideoFilename)

    const startUploadButton = page.locator('button:has-text("Start upload")')
    await expect(startUploadButton).toBeVisible({ timeout: 10000 })
    await startUploadButton.click()

    const uploadCompleted = page.locator('text=Upload completed successfully!')
    await expect(uploadCompleted).toBeVisible({ timeout: 60000 })

    await page.fill('#field-alt', 'Test video TUS upload')

    await saveDocAndAssert(page)
    await deleteDocAndAssert(page)
  })
})

test.describe('Stream - TUS Resume Upload', () => {
  const serverUrl = getServerUrl()
  const testVideoFilename = 'stream-resume-video.mp4'

  test('should recognize already uploaded file and skip upload', async ({ page }) => {
    await page.goto(`${serverUrl}/admin/collections/stream-manual/create`)
    await page.waitForLoadState('networkidle')

    const enableTusButton1 = page.locator('button:has-text("Enable tus mode")')
    await expect(enableTusButton1).toBeVisible({ timeout: 5000 })
    await enableTusButton1.click()

    const fileChooserPromise1 = page.waitForEvent('filechooser')
    await page.locator('.storage-bunny-tus-upload__dropzoneButtons').getByText('Select a file').click()
    const fileChooser1 = await fileChooserPromise1
    await fileChooser1.setFiles(path.join(__dirname, '../../fixtures/test-video.mp4'))

    await page.waitForSelector('.storage-bunny-tus-upload', { timeout: 5000 })

    await page.fill('.storage-bunny-tus-upload__filename', testVideoFilename)

    const startUploadButton = page.locator('button:has-text("Start upload")')
    await expect(startUploadButton).toBeVisible({ timeout: 10000 })
    await startUploadButton.click()

    const uploadCompleted = page.locator('text=Upload completed successfully!')
    await expect(uploadCompleted).toBeVisible({ timeout: 60000 })

    await page.fill('#field-alt', 'First upload')

    await saveDocAndAssert(page)

    await page.goto(`${serverUrl}/admin/collections/stream-manual/create`)
    await page.waitForLoadState('networkidle')

    const enableTusButton2 = page.locator('button:has-text("Enable tus mode")')
    await expect(enableTusButton2).toBeVisible({ timeout: 5000 })
    await enableTusButton2.click()

    const fileChooserPromise2 = page.waitForEvent('filechooser')
    await page.locator('.storage-bunny-tus-upload__dropzoneButtons').getByText('Select a file').click()
    const fileChooser2 = await fileChooserPromise2
    await fileChooser2.setFiles(path.join(__dirname, '../../fixtures/test-video.mp4'))

    await page.waitForSelector('.storage-bunny-tus-upload', { timeout: 5000 })

    await page.fill('.storage-bunny-tus-upload__filename', testVideoFilename)

    const startUploadButton2 = page.locator('button:has-text("Start upload")')
    await expect(startUploadButton2).toBeVisible({ timeout: 10000 })
    await startUploadButton2.click()

    const uploadCompletedImmediately = page.locator('text=Upload completed successfully!')
    await expect(uploadCompletedImmediately).toBeVisible({ timeout: 10000 })

    await page.fill('#field-alt', 'Second upload (should be instant)')

    await saveDocAndAssert(page)

    await deleteDocAndAssert(page)

    await page.goto(`${serverUrl}/admin/collections/stream-manual`)
    await page.waitForLoadState('networkidle')

    const firstRow = page.locator('.row-1 a[href*="/admin/collections/stream-manual/"]').first()
    await firstRow.click()
    await page.waitForLoadState('networkidle')

    await deleteDocAndAssert(page)
  })
})

test.describe('Stream - TUS File Replacement', () => {
  const serverUrl = getServerUrl()
  const firstVideoFilename = 'stream-replace-first.mp4'
  const secondVideoFilename = 'stream-replace-second.mp4'

  test('should upload first file, remove it, upload second file, then save', async ({ page }) => {
    test.setTimeout(600000)

    await page.goto(`${serverUrl}/admin/collections/stream-manual/create`)
    await page.waitForLoadState('networkidle')

    const enableTusButton = page.locator('button:has-text("Enable tus mode")')
    await expect(enableTusButton).toBeVisible({ timeout: 5000 })
    await enableTusButton.click()

    const fileChooserPromise1 = page.waitForEvent('filechooser')
    await page.locator('.storage-bunny-tus-upload__dropzoneButtons').getByText('Select a file').click()
    const fileChooser1 = await fileChooserPromise1
    await fileChooser1.setFiles(path.join(__dirname, '../../fixtures/test-video.mp4'))

    await page.waitForSelector('.storage-bunny-tus-upload', { timeout: 5000 })

    await page.fill('.storage-bunny-tus-upload__filename', firstVideoFilename)

    const startUploadButton1 = page.locator('button:has-text("Start upload")')
    await expect(startUploadButton1).toBeVisible({ timeout: 10000 })
    await startUploadButton1.click()

    const uploadCompleted1 = page.locator('text=Upload completed successfully!')
    await expect(uploadCompleted1).toBeVisible({ timeout: 60000 })

    const removeButton = page.locator('.storage-bunny-tus-upload__remove')
    await expect(removeButton).toBeVisible()
    await removeButton.click()

    await expect(page.locator('.storage-bunny-tus-upload__dropzoneButtons')).toBeVisible()

    const fileChooserPromise2 = page.waitForEvent('filechooser')
    await page.locator('.storage-bunny-tus-upload__dropzoneButtons').getByText('Select a file').click()
    const fileChooser2 = await fileChooserPromise2
    await fileChooser2.setFiles(path.join(__dirname, '../../fixtures/test-video.mp4'))

    await page.waitForSelector('.storage-bunny-tus-upload', { timeout: 5000 })

    await page.fill('.storage-bunny-tus-upload__filename', secondVideoFilename)

    const startUploadButton2 = page.locator('button:has-text("Start upload")')
    await expect(startUploadButton2).toBeVisible({ timeout: 10000 })
    await startUploadButton2.click()

    const uploadCompleted2 = page.locator('text=Upload completed successfully!')
    await expect(uploadCompleted2).toBeVisible({ timeout: 10000 })

    await page.fill('#field-alt', 'Replaced video upload')

    await saveDocAndAssert(page)

    const url = page.url()
    const docId = url.match(/\/stream-manual\/([a-f0-9]+)/)?.[1]
    expect(docId).toBeTruthy()

    const response = await page.request.get(`${serverUrl}/api/stream-manual/${docId}`)
    expect(response.ok()).toBeTruthy()
    const doc = await response.json()
    expect(doc.bunnyData).toBeTruthy()
    expect(doc.bunnyData.type).toBe('stream')
    expect(doc.bunnyData.stream.videoId).toBeTruthy()

    const videoId = doc.bunnyData.stream.videoId
    const processed = await waitForVideoProcessed(videoId, { timeout: 300000 })
    expect(processed).toBeTruthy()

    const mp4Url = `${serverUrl}/api/stream-manual/file/${doc.filename}`
    await expect
      .poll(async () => (await page.request.get(mp4Url)).status(), { intervals: [1000, 2000, 5000], timeout: 120000 })
      .toBe(200)

    await deleteDocAndAssert(page)
  })
})

test.describe('Stream - MP4 Fallback', () => {
  const serverUrl = getServerUrl()
  const testVideoFilename = 'stream-mp4-fallback.mp4'

  test.afterAll(async () => {
    await cleanupStreamVideos(['stream-mp4-fallback'])
  })

  test('should serve MP4 with correct content-type after processing', async ({ page }) => {
    test.setTimeout(600000)

    await page.goto(`${serverUrl}/admin/collections/stream-manual/create`)
    await page.waitForLoadState('networkidle')

    const enableTusButton = page.locator('button:has-text("Enable tus mode")')
    await expect(enableTusButton).toBeVisible({ timeout: 5000 })
    await enableTusButton.click()

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('.storage-bunny-tus-upload__dropzoneButtons').getByText('Select a file').click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(path.join(__dirname, '../../fixtures/test-video.mp4'))

    await page.waitForSelector('.storage-bunny-tus-upload', { timeout: 5000 })
    await page.fill('.storage-bunny-tus-upload__filename', testVideoFilename)

    const startUploadButton = page.locator('button:has-text("Start upload")')
    await expect(startUploadButton).toBeVisible({ timeout: 10000 })
    await startUploadButton.click()

    const uploadCompleted = page.locator('text=Upload completed successfully!')
    await expect(uploadCompleted).toBeVisible({ timeout: 60000 })

    await page.fill('#field-alt', 'MP4 Fallback test video')

    await saveDocAndAssert(page)

    const url = page.url()
    const docId = url.match(/\/stream-manual\/([a-f0-9]+)/)?.[1]
    expect(docId).toBeTruthy()

    const response = await page.request.get(`${serverUrl}/api/stream-manual/${docId}`)
    expect(response.ok()).toBeTruthy()
    const doc = await response.json()

    expect(doc.bunnyData).toBeTruthy()
    expect(doc.bunnyData.type).toBe('stream')

    const videoId = doc.bunnyData.stream.videoId
    const processed = await waitForVideoProcessed(videoId, { timeout: 300000 })
    expect(processed).toBeTruthy()

    const mp4Url = `${serverUrl}/api/stream-manual/file/${doc.filename}`
    await expect
      .poll(async () => (await page.request.get(mp4Url)).status(), { intervals: [1000, 2000, 5000], timeout: 120000 })
      .toBe(200)

    const mp4FallbackResponse = await page.request.get(mp4Url)
    const contentType = mp4FallbackResponse.headers()['content-type']
    expect(contentType).toContain('video/mp4')

    await deleteDocAndAssert(page)
  })
})
