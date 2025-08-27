import type { NormalizedUrlTransformConfig } from '@/types/index.js'
import type { CollectionConfig } from 'payload'

export const applyUrlTransform = ({
  collection,
  config,
  data,
  filename,
  prefix,
  url,
}: {
  collection: CollectionConfig
  config: false | NormalizedUrlTransformConfig
  data?: Record<string, unknown>
  filename: string
  prefix?: string
  url: string
}): string => {
  if (!config) {
    return url
  }

  if (config.transformUrl) {
    return config.transformUrl({
      baseUrl: url,
      collection,
      data,
      filename,
      prefix,
    })
  }

  const urlObject = new URL(url)
  const params = new URLSearchParams(urlObject.search)

  if (config.appendTimestamp) {
    const timestamp = Date.now().toString()
    if (!params.has('t')) {
      params.set('t', timestamp)
    }
  }

  for (const [key, value] of Object.entries(config.queryParams)) {
    if (!params.has(key)) {
      params.set(key, value)
    }
  }

  const queryString = params.toString()
  return queryString ? `${urlObject.origin}${urlObject.pathname}?${queryString}` : `${urlObject.origin}${urlObject.pathname}`
}

