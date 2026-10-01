import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { BUNNY_API } from '@/shared/constants.js'

import { cleanupStreamVideos, waitForVideoProcessed } from '../../helpers/e2e/bunnyStream.js'
import { deleteDocAndAssert, saveDocAndAssert, waitForFormReady } from '../../helpers/e2e/interactions.js'
import { getServerUrl } from '../../helpers/e2e/server.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const videoPath = path.join(__dirname, '../../fixtures/test-video.mp4')
const video = readFileSync(videoPath)

const serverUrl = getServerUrl()

const uploadedStatus = (page: Page) => page.locator('.storage-bunny-tus-upload__status', { hasText: 'Uploaded' })

const openCreate = async (page: Page, collection: string): Promise<void> => {
  await page.goto(`${serverUrl}/admin/collections/${collection}/create`)
  await waitForFormReady(page)
}

const enableTusAndSelect = async (page: Page, files: Parameters<Page['setInputFiles']>[1]): Promise<void> => {
  await page.getByRole('button', { name: 'Enable TUS mode' }).click()
  await selectTusFile(page, files)
}

const selectTusFile = async (page: Page, files: Parameters<Page['setInputFiles']>[1]): Promise<void> => {
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.locator('.storage-bunny-tus-upload__dropzoneButtons').getByText('Select a file').click()
  await (await fileChooserPromise).setFiles(files)
}

const startUpload = async (page: Page, name: 'Resume' | 'Start upload' = 'Start upload'): Promise<string> => {
  const button = page.getByRole('button', { exact: true, name })
  await button.waitFor()
  const tusAuth = page.waitForResponse((response) => response.url().includes('/storage-bunny/stream/tus-auth'))
  await button.click()
  return (await (await tusAuth).json()).videoId
}

const readSavedDoc = async (page: Page, collection: string) => {
  const docId = page.url().match(new RegExp(`/${collection}/([^/?]+)`))?.[1]
  expect(docId).toBeTruthy()
  const response = await page.request.get(`${serverUrl}/api/${collection}/${docId}`)
  expect(response.ok()).toBeTruthy()
  return response.json()
}

test.afterAll(async () => {
  await cleanupStreamVideos([
    'stream-auto-video',
    'stream-resume-video',
    'stream-replace-first',
    'stream-replace-second',
  ])
})

test.describe('Stream - TUS uploads', () => {
  test('uploads and deletes a video in auto mode', async ({ page }) => {
    await openCreate(page, 'stream-auto')

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.click('text=Select a file')
    await (await fileChooserPromise).setFiles(videoPath)

    await page.fill('#field-storage-bunny-tus-upload-filename', 'stream-auto-video.mp4')
    await startUpload(page)
    await expect(uploadedStatus(page)).toBeVisible({ timeout: 60000 })

    await page.fill('#field-alt', 'Test video with auto TUS mode')
    await saveDocAndAssert(page)
    await deleteDocAndAssert(page)
  })

  test('resumes an interrupted upload into the same video', async ({ page }) => {
    test.setTimeout(2 * 60_000)

    const isTusRequest = (url: URL) => url.href.startsWith(BUNNY_API.TUS_ENDPOINT)
    await page.route(isTusRequest, (route) => (route.request().method() === 'PATCH' ? route.abort() : route.continue()))

    await openCreate(page, 'stream-manual')
    await enableTusAndSelect(page, videoPath)
    await page.fill('#field-storage-bunny-tus-upload-filename', 'stream-resume-video.mp4')

    const patchAttempt = page.waitForRequest(
      (request) => request.method() === 'PATCH' && request.url().startsWith(BUNNY_API.TUS_ENDPOINT),
    )
    const videoId = await startUpload(page)
    await patchAttempt

    page.once('dialog', (dialog) => void dialog.accept())
    await openCreate(page, 'stream-manual')
    await page.unroute(isTusRequest)
    await enableTusAndSelect(page, videoPath)
    expect(await startUpload(page, 'Resume')).toBe(videoId)
    await expect(uploadedStatus(page)).toBeVisible({ timeout: 60000 })

    await page.fill('#field-alt', 'Resumed upload')
    await saveDocAndAssert(page)

    const doc = await readSavedDoc(page, 'stream-manual')
    expect(doc.bunnyData.stream.videoId).toBe(videoId)

    await deleteDocAndAssert(page)
  })

  test('replaces the selected video before save and serves its MP4 fallback', async ({ page }) => {
    test.setTimeout(5 * 60_000)

    await openCreate(page, 'stream-manual')
    await enableTusAndSelect(page, { buffer: video, mimeType: 'video/mp4', name: 'stream-replace-first.mp4' })
    const firstVideoId = await startUpload(page)
    await expect(uploadedStatus(page)).toBeVisible({ timeout: 60000 })

    await page.locator('.storage-bunny-tus-upload__remove').click()
    await selectTusFile(page, { buffer: video, mimeType: 'video/mp4', name: 'stream-replace-second.mp4' })
    const secondVideoId = await startUpload(page)
    await expect(uploadedStatus(page)).toBeVisible({ timeout: 60000 })

    await page.fill('#field-alt', 'Replaced video upload')
    await saveDocAndAssert(page)

    const doc = await readSavedDoc(page, 'stream-manual')
    expect(secondVideoId).not.toBe(firstVideoId)
    expect(doc.bunnyData.stream.videoId).toBe(secondVideoId)
    expect(doc.filename).toBe('stream-replace-second.mp4')

    expect(await waitForVideoProcessed(secondVideoId, { timeout: 3 * 60_000 })).toBe(true)

    const mp4Url = `${serverUrl}/api/stream-manual/file/${doc.filename}`
    await expect
      .poll(async () => (await page.request.get(mp4Url)).status(), { intervals: [1000, 2000, 5000], timeout: 60000 })
      .toBe(200)
    expect((await page.request.get(mp4Url)).headers()['content-type']).toContain('video/mp4')

    await deleteDocAndAssert(page)
  })
})
