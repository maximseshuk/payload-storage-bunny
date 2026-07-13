import { HTTPError } from 'ky'

import { BUNNY_API, TIMEOUTS } from '../constants.js'
import { kyClient } from '../kyClient.js'

export const purgeCache = async ({
  apiKey,
  async = false,
  url,
}: {
  apiKey: string
  async?: boolean
  url: string
}): Promise<void> => {
  if (!apiKey) {
    throw new Error('API key is required for cache purging')
  }

  try {
    await kyClient.post(`${BUNNY_API.BASE_URL}/purge`, {
      headers: {
        'AccessKey': apiKey,
      },
      searchParams: {
        async,
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
