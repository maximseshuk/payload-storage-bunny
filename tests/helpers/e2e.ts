import type { Page } from '@playwright/test'

import { expect } from '@playwright/test'

const POLL_TOPASS_TIMEOUT = 10000

export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Adapted from Payload CMS
 * @see https://github.com/payloadcms/payload/blob/main/test/helpers.ts
 * @license MIT
 */
export const saveDocAndAssert = async (
  page: Page,
  options: {
    expectation?: 'error' | 'success'
    selector?:
      | '#action-publish'
      | '#action-save'
      | '#action-save-draft'
      | '#publish-locale'
      | string
    timeout?: number
  } = {},
): Promise<void> => {
  const { expectation = 'success', selector = '#action-save', timeout = 5000 } = options

  await wait(500)
  await page.click(selector, { delay: 100 })

  if (expectation === 'success') {
    await expect(page.locator('.payload-toast-container')).toContainText('successfully', {
      timeout,
    })
    await expect.poll(() => page.url(), { timeout: POLL_TOPASS_TIMEOUT }).not.toContain('/create')
  } else {
    await expect(page.locator('.payload-toast-container .toast-error')).toBeVisible({ timeout })
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
