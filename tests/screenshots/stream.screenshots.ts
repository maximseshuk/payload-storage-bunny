import fs from 'node:fs/promises'
import path from 'node:path'

import type { APIRequestContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'

import { cleanupStreamVideos, waitForVideoProcessed } from '../helpers/e2e/bunnyStream.js'
import { saveDocAndAssert, waitForFormReady } from '../helpers/e2e/interactions.js'
import { devUser } from '../helpers/shared/buildConfigWithDefaults.js'

const root = path.resolve(import.meta.dirname, '../..')
const fixtures = path.join(root, 'tests/fixtures')
const outDir = path.join(root, 'media/screenshots')
const collection = 'media'
const width = 1600

const video = await fs.readFile(path.join(fixtures, 'test-video.mp4'))

const files = [
  {
    alt: 'Spring campaign',
    buffer: await fs.readFile(path.join(fixtures, 'test-image.jpg')),
    mimeType: 'image/jpeg',
    name: 'spring-campaign.jpg',
  },
  { alt: 'Product tour', buffer: video, mimeType: 'video/mp4', name: 'product-tour.mp4' },
]

type Doc = { bunnyData?: { stream?: { videoId?: string } }; id: number | string }

const upload = async (request: APIRequestContext, { alt, ...file }: (typeof files)[number]): Promise<Doc> => {
  const created = await request.post(`/api/${collection}`, {
    multipart: { _payload: JSON.stringify({ alt }), file },
  })
  expect(created.ok()).toBe(true)
  return ((await created.json()) as { doc: Doc }).doc
}

const frame = async (page: Page, name: string) => {
  const shot = await page.screenshot()
  const url = new URL(page.url())
  const framePage = await page.context().newPage()
  await framePage.setViewportSize({ height: 1200, width: width + 128 })
  await framePage.setContent(`<!doctype html>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { background: #0a0c0e; }
  .stage {
    background:
      radial-gradient(60% 70% at 18% 20%, rgba(239, 97, 38, 0.28), transparent 70%),
      radial-gradient(50% 60% at 90% 100%, rgba(239, 97, 38, 0.12), transparent 70%),
      #0a0c0e;
    display: inline-block;
    padding: 64px;
  }
  .window {
    background: #141619;
    border-radius: 14px;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 40px 80px -20px rgba(0, 0, 0, 0.8), 0 0 120px rgba(239, 97, 38, 0.12);
    overflow: hidden;
    width: ${width}px;
  }
  .bar {
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    gap: 8px;
    height: 40px;
    padding: 0 16px;
    position: relative;
  }
  .dot { border-radius: 50%; height: 12px; width: 12px; }
  .url {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.55);
    font: 13px/24px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    left: 50%;
    padding: 0 16px;
    position: absolute;
    transform: translateX(-50%);
  }
  img { display: block; width: ${width}px; }
</style>
<div class="stage">
  <div class="window">
    <div class="bar">
      <span class="dot" style="background:#ff5f57"></span>
      <span class="dot" style="background:#febc2e"></span>
      <span class="dot" style="background:#28c840"></span>
      <span class="url">${url.pathname}</span>
    </div>
    <img src="data:image/png;base64,${shot.toString('base64')}" />
  </div>
</div>`)
  await framePage.locator('img').evaluate((img: HTMLImageElement) => img.decode())
  const png = await framePage.locator('.stage').screenshot()
  await sharp(png)
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(path.join(outDir, `${name}.png`))
  await framePage.close()
}

const open = async (page: Page, pathname: string, height: number) => {
  await page.setViewportSize({ height, width })
  await page.goto(pathname)
  await page.addStyleTag({
    content: `nextjs-portal, nav *:has(> a[href="/admin/collections/users"]) { display: none !important; }`,
  })
}

test.use({ colorScheme: 'dark', deviceScaleFactor: 2, viewport: { height: 660, width } })

test.describe('screenshots', () => {
  const docs: Record<string, Doc> = {}

  test.beforeAll(async ({ request }) => {
    test.setTimeout(5 * 60_000)
    await fs.mkdir(outDir, { recursive: true })
    expect((await request.post('/api/users/login', { data: devUser })).ok()).toBe(true)
    for (const file of files) {
      docs[file.name] = await upload(request, file)
    }
    const { id, bunnyData } = docs['product-tour.mp4']
    const videoId = bunnyData?.stream?.videoId
    expect(videoId).toBeTruthy()
    expect(await waitForVideoProcessed(videoId!, { resolutions: true, timeout: 4 * 60_000 })).toBe(true)
    await expect
      .poll(
        async () =>
          (await (await request.get(`/api/storage-bunny/stream/status/${collection}/${id}/${videoId}`)).json()).state,
        { intervals: [2000, 5000], timeout: 60_000 },
      )
      .toBe('ready')
  })

  test.afterAll(async ({ request }) => {
    await request.post('/api/users/login', { data: devUser })
    await request.delete(`/api/${collection}?where[id][exists]=true`)
    await cleanupStreamVideos(['product-tour', 'onboarding'])
  })

  test.beforeEach(async ({ baseURL, context }) => {
    await context.addCookies([{ name: 'payload-theme', url: baseURL, value: 'dark' }])
  })

  test('TUS upload in progress', async ({ page }) => {
    await open(page, `/admin/collections/${collection}/create`, 820)
    await waitForFormReady(page)

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {
      downloadThroughput: -1,
      latency: 0,
      offline: false,
      uploadThroughput: 120 * 1024,
    })

    const fileChooser = page.waitForEvent('filechooser')
    await page.click('text=Select a file')
    await (await fileChooser).setFiles({ buffer: video, mimeType: 'video/mp4', name: 'onboarding.mp4' })
    await page.fill('#field-alt', 'Onboarding walkthrough')
    await page.getByRole('button', { exact: true, name: 'Start upload' }).click()

    const progress = page.locator('.storage-bunny-tus-upload [role="progressbar"]')
    await expect
      .poll(async () => Number(await progress.getAttribute('aria-valuenow')), { intervals: [100], timeout: 60_000 })
      .toBeGreaterThanOrEqual(45)
    await page.mouse.move(0, 0)
    await frame(page, 'tus-upload')

    await cdp.send('Network.emulateNetworkConditions', {
      downloadThroughput: -1,
      latency: 0,
      offline: false,
      uploadThroughput: -1,
    })
    await expect(page.locator('.storage-bunny-tus-upload__status', { hasText: 'Uploaded' })).toBeVisible({
      timeout: 60_000,
    })
    await saveDocAndAssert(page)
  })

  test('list view with the stream status', async ({ page }) => {
    const where = 'where[or][0][and][0][bunnyStream][in][0]=ready&where[or][0][and][0][bunnyStream][in][1]=processing'
    await open(page, `/admin/collections/${collection}?${where}`, 560)
    await expect(page.locator('.cell-bunnyStream .pill')).toHaveCount(2)
    await page
      .locator('.cell-filename img')
      .evaluateAll((images: HTMLImageElement[]) =>
        Promise.all(images.map((img) => img.decode().catch(() => undefined))),
      )
    await frame(page, 'list-status')
  })

  test('ready video in the edit view', async ({ page }) => {
    await open(page, `/admin/collections/${collection}/${docs['product-tour.mp4'].id}`, 900)
    await expect(page.locator('.storage-bunny-stream-card__status')).toContainText('Ready')
    await expect(page.locator('.storage-bunny-stream-preview__player')).not.toHaveAttribute('inert')
    await page.waitForTimeout(2000)
    await frame(page, 'edit-stream')
  })

  test('image from Bunny Storage', async ({ page }) => {
    await open(page, `/admin/collections/${collection}/${docs['spring-campaign.jpg'].id}`, 900)
    await waitForFormReady(page)
    await page
      .locator('img[src*="spring-campaign"]:visible')
      .first()
      .evaluate((img: HTMLImageElement) => img.decode())
    await page.waitForTimeout(1000)
    await frame(page, 'edit-image')
  })
})
