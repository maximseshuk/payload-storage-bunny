import { bunnyRequest } from '@/server/bunny/client.js'
import { BUNNY_API, TIMEOUTS } from '@/shared/constants.js'

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

  await bunnyRequest({
    accept: false,
    apiKey,
    genericError: `Unable to purge cache: ${url}`,
    method: 'post',
    searchParams: { async, url },
    statusErrors: {
      401: 'Bunny.net: Invalid API key',
      500: 'Bunny.net: Server error',
    },
    timeout: TIMEOUTS.DEFAULT,
    url: `${BUNNY_API.BASE_URL}/purge`,
  })
}
