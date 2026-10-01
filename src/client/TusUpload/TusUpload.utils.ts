import { FILE_FIELD_REMOVE_BUTTON_SELECTOR } from './TusUpload.constants.js'

export const clickFileFieldRemoveButton = (root: HTMLElement | null, timeoutMs = 5000): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!root) {
      resolve(false)
      return
    }

    const existingButton = root.querySelector(FILE_FIELD_REMOVE_BUTTON_SELECTOR)
    if (existingButton) {
      ;(existingButton as HTMLButtonElement).click()
      resolve(true)
      return
    }

    const observer = new MutationObserver(() => {
      const button = root.querySelector(FILE_FIELD_REMOVE_BUTTON_SELECTOR)
      if (button) {
        observer.disconnect()
        clearTimeout(timeoutId)
        ;(button as HTMLButtonElement).click()
        // eslint-disable-next-line promise/no-multiple-resolved
        resolve(true)
      }
    })

    observer.observe(root, {
      childList: true,
      subtree: true,
    })

    const timeoutId = setTimeout(() => {
      observer.disconnect()
      resolve(false)
    }, timeoutMs)
  })
}
