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

  let urlObject: URL
  let isRelative = false

  try {
    urlObject = new URL(url)
  } catch {
    isRelative = true
    urlObject = new URL(url, 'http://localhost')
  }

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

  if (isRelative) {
    return queryString ? `${urlObject.pathname}?${queryString}` : urlObject.pathname
  }

  return queryString ? `${urlObject.origin}${urlObject.pathname}?${queryString}` : `${urlObject.origin}${urlObject.pathname}`
}

