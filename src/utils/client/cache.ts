import type { PurgeConfig } from '@/types/index.js'

import { HTTPError } from 'ky'

import { BUNNY_API, TIMEOUTS } from '../constants.js'
import { kyClient } from '../kyClient.js'

export const purgeCache = async ({
  purgeConfig,
  url,
}: {
  purgeConfig: PurgeConfig
  url: string
}): Promise<void> => {
  if (!purgeConfig) {
    throw new Error('Purge configuration is required')
  }

  try {
    await kyClient.post(`${BUNNY_API.BASE_URL}/purge`, {
      headers: {
        'AccessKey': purgeConfig.apiKey,
      },
      searchParams: {
        async: purgeConfig.async || false,
        url,
      },
      timeout: TIMEOUTS.DEFAULT,
    })
  } catch (err) {
    if (err instanceof HTTPError) {
      if (err.response.status === 401) {
        throw new Error('Bunny.net: Invalid API key')
      } else if (err.response.status === 500) {
        throw new Error('Bunny.net: Server error')
      }
    }

    throw new Error(`Unable to purge cache: ${url}`)
  }
}
