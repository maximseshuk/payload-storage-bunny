import type { Payload } from 'payload'

import { TELEMETRY_DOCS_URL, TELEMETRY_PRODUCT } from './constants.js'

export const printNotice = (logger: Payload['logger']): void => {
  logger.info(
    `[${TELEMETRY_PRODUCT}] Anonymous usage telemetry is on: plugin/Payload/Node versions and which features are enabled — never secrets, IP, keys, zone/library names, or collection names. Opt out with telemetry: false, DO_NOT_TRACK=1, or BUNNY_TELEMETRY_DISABLED=1. What is sent: ${TELEMETRY_DOCS_URL}`,
  )
}
