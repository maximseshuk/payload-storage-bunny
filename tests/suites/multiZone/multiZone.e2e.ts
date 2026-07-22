import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import { cleanupStreamVideos } from '../../helpers/e2e/bunnyStream.js'
import { deleteDocAndAssert, saveDocAndAssert } from '../../helpers/e2e/interactions.js'
import { getServerUrl } from '../../helpers/e2e/server.js'
import { hasBunnyCredentials, hasSignedBunnyCredentials } from '../../helpers/shared/credentials.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(__dirname, '../../fixtures')

const globalStorageHost = process.env.BUNNY_STORAGE_HOSTNAME || ''
const signedStorageHost = process.env.BUNNY_SIGNED_STORAGE_HOSTNAME || ''
const globalLibraryId = parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0', 10)
const signedLibraryId = parseInt(process.env.BUNNY_SIGNED_STREAM_LIBRARY_ID || '0', 10)

const uploadImageAndRead = async (
  page: import('@playwright/test').Page,
  serverUrl: string,
  slug: string,
): Promise<{ bunnyData: Record<string, unknown>; docId: string; url: string }> => {
  await page.goto(`${serverUrl}/admin/collections/${slug}/create`)
  await page.waitForLoadState('networkidle')

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.click('text=Select a file')
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(path.join(fixturesDir, 'test-image.jpg'))

  await page.fill('#field-alt', `multi-zone ${slug}`)
  await saveDocAndAssert(page)

  const docId = page.url().match(new RegExp(`/${slug}/([a-f0-9]+)`))?.[1] as string
  expect(docId).toBeTruthy()

  const response = await page.request.get(`${serverUrl}/api/${slug}/${docId}`)
  expect(response.ok()).toBeTruthy()
  const doc = await response.json()

  return { bunnyData: doc.bunnyData, docId, url: doc.url as string }
}

test.describe('Multi-zone - per-collection storage zones', () => {
  test.skip(!(hasBunnyCredentials() && hasSignedBunnyCredentials()), 'Requires BUNNY_* and BUNNY_SIGNED_* credentials')

  const serverUrl = getServerUrl()

  test('global-zone collection serves from the global hostname, unsigned, and is fetchable', async ({ page }) => {
    const { url } = await uploadImageAndRead(page, serverUrl, 'mz-storage-global')

    expect(url).toContain(globalStorageHost)
    expect(url).not.toContain(signedStorageHost)
    expect(url).not.toContain('token=')

    const fetched = await page.request.get(url)
    expect(fetched.status()).toBe(200)

    await deleteDocAndAssert(page)
  })

  test('override-zone collection serves from its own hostname, signed, and is fetchable', async ({ page }) => {
    const { url } = await uploadImageAndRead(page, serverUrl, 'mz-storage-signed')

    expect(url).toContain(signedStorageHost)
    expect(url).not.toContain(globalStorageHost)
    expect(url).toContain('token=')
    expect(url).toContain('expires=')

    const fetched = await page.request.get(url)
    expect(fetched.status()).toBe(200)

    await deleteDocAndAssert(page)
  })
})

test.describe('Multi-zone - per-collection stream libraries (TUS auth)', () => {
  test.skip(!(hasBunnyCredentials() && hasSignedBunnyCredentials()), 'Requires BUNNY_* and BUNNY_SIGNED_* credentials')

  const serverUrl = getServerUrl()

  test.afterAll(async () => {
    await cleanupStreamVideos('mz-stream-signed clip', { envPrefix: 'SIGNED' })
    await cleanupStreamVideos('mz-stream-global clip')
  })

  const requestTusAuth = async (page: import('@playwright/test').Page, collection: string) => {
    await page.goto(`${serverUrl}/admin`)
    await page.waitForLoadState('networkidle')

    const res = await page.request.post(`${serverUrl}/api/storage-bunny/stream/tus-auth`, {
      data: {
        collection,
        filename: `${collection}.mp4`,
        filesize: 1024,
        filetype: 'video/mp4',
        title: `${collection} clip`,
      },
    })
    expect(res.ok()).toBeTruthy()
    return res.json()
  }

  test('tus-auth for the override collection mints against the signed library', async ({ page }) => {
    const json = await requestTusAuth(page, 'mz-stream-signed')

    expect(json.type).toBe('upload')
    expect(json.libraryId).toBe(signedLibraryId)
    expect(json.videoId).toBeTruthy()
    expect(json.authorizationSignature).toMatch(/^[a-f0-9]{64}$/)
    expect(typeof json.authorizationExpire).toBe('number')
  })

  test('tus-auth for the sibling collection mints against the global library', async ({ page }) => {
    const json = await requestTusAuth(page, 'mz-stream-global')

    expect(json.type).toBe('upload')
    expect(json.libraryId).toBe(globalLibraryId)
    expect(json.authorizationSignature).toMatch(/^[a-f0-9]{64}$/)
  })
})
