import { FILE_FIELD_REMOVE_BUTTON_SELECTOR } from './TusUpload.constants.js'

export const clickFileFieldRemoveButton = (timeoutMs = 5000): Promise<boolean> => {
  return new Promise((resolve) => {
    const existingButton = document.querySelector(FILE_FIELD_REMOVE_BUTTON_SELECTOR)
    if (existingButton) {
      ;(existingButton as HTMLButtonElement).click()
      resolve(true)
      return
    }

    const observer = new MutationObserver(() => {
      const button = document.querySelector(FILE_FIELD_REMOVE_BUTTON_SELECTOR)
      if (button) {
        observer.disconnect()
        clearTimeout(timeoutId)
        ;(button as HTMLButtonElement).click()
        resolve(true)
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    const timeoutId = setTimeout(() => {
      observer.disconnect()
      resolve(false)
    }, timeoutMs)
  })
}
