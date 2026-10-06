import type { CollectionConfig } from 'payload'

import type { NormalizedUrlTransformOptions } from '@/shared/types/index.js'

export const applyUrlTransform = ({
  collection,
  options,
  data,
  filename,
  prefix,
  url,
}: {
  collection: CollectionConfig
  options: false | NormalizedUrlTransformOptions
  data?: Record<string, unknown>
  filename: string
  prefix?: string
  url: string
}): string => {
  if (!options) {
    return url
  }

  if (options.transformUrl) {
    return options.transformUrl({
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

  if (options.appendTimestamp) {
    const timestamp = Date.now().toString()
    if (!params.has('t')) {
      params.set('t', timestamp)
    }
  }

  for (const [key, value] of Object.entries(options.queryParams)) {
    if (!params.has(key)) {
      params.set(key, value)
    }
  }

  const queryString = params.toString()

  if (isRelative) {
    return queryString ? `${urlObject.pathname}?${queryString}` : urlObject.pathname
  }

  return queryString
    ? `${urlObject.origin}${urlObject.pathname}?${queryString}`
    : `${urlObject.origin}${urlObject.pathname}`
}
