export type Logger = {
  error: (message: string) => void
  info: (message: string) => void
  warn: (message: string) => void
}

/* eslint-disable no-console */
export const consoleLogger: Logger = {
  error: console.error,
  info: console.log,
  warn: console.warn,
}
/* eslint-enable no-console */
