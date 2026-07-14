import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

const POLL_TOPASS_TIMEOUT = 10000

export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export type NetworkCall = { method: string; status: number; url: string }

export const recordResponses = (page: Page): NetworkCall[] => {
  const calls: NetworkCall[] = []
  page.on('response', (response) => {
    calls.push({ method: response.request().method(), status: response.status(), url: response.url() })
  })
  return calls
}

/**
 * `closeAllToasts` and `saveDocAndAssert` are adapted from Payload CMS.
 * @see https://github.com/payloadcms/payload/blob/main/test/__helpers/e2e/helpers.ts
 * @license MIT
 */
export const closeAllToasts = async (page: Locator | Page): Promise<void> => {
  const toastCloseSelector = '.payload-toast-container button.payload-toast-close-button'
  let count = await page.locator(toastCloseSelector).count()

  while (count > 0) {
    await page.locator(toastCloseSelector).first().click()
    await expect(page.locator(toastCloseSelector)).toHaveCount(count - 1)
    count--
  }
}

export const saveDocAndAssert = async (
  page: Page,
  selector: '#action-publish' | '#action-save' | '#action-save-draft' | '#publish-locale' | string = '#action-save',
  expectation: 'error' | 'success' = 'success',
  options?: {
    disableDismissAllToasts?: boolean
  },
): Promise<void> => {
  await wait(500)
  if (selector === '#publish-locale') {
    const chevronButton = page.locator('.form-submit .popup__trigger-wrap > .popup-button')
    await chevronButton.click()
  }
  await page.click(selector, { delay: 100 })

  if (expectation === 'success') {
    await expect(page.locator('.payload-toast-container')).toContainText('successfully')
    await expect.poll(() => page.url(), { timeout: POLL_TOPASS_TIMEOUT }).not.toContain('/create')
  } else {
    await expect(page.locator('.payload-toast-container .toast-error')).toBeVisible()
  }

  if (!options?.disableDismissAllToasts) {
    await closeAllToasts(page)
  }
}

export const deleteDocAndAssert = async (page: Page): Promise<void> => {
  const collectionSlug = page.url().match(/\/collections\/([^/]+)\//)?.[1]

  await page.locator('.doc-controls__popup .popup-button').click()
  await page.locator('#action-delete').click()
  await page.locator('#confirm-action').click()
  await expect(page.locator('.payload-toast-container')).toContainText('successfully deleted')

  if (collectionSlug) {
    await expect(page).toHaveURL(new RegExp(`/admin/collections/${collectionSlug}(\\?.*)?$`))
  }
}
