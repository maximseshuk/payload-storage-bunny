import type { Endpoint } from 'payload'

import { collectWebhookSecrets, hasAnyStreamTus } from '@/server/payload/options/inspect.js'
import type { NormalizedBunnyStorageOptions } from '@/shared/types/optionsNormalized.js'

import { getStreamStatusEndpoint } from './status.js'
import { getStreamThumbnailEndpoint } from './thumbnail.js'
import { getStreamTusAuthEndpoint } from './tusAuth.js'
import { getStreamWebhookEndpoint } from './webhook.js'

export const getStreamEndpoints = (options: NormalizedBunnyStorageOptions): Endpoint[] => {
  const webhookSecrets = collectWebhookSecrets(options)

  const endpoints: Endpoint[] = []

  if (hasAnyStreamTus(options)) {
    endpoints.push(getStreamTusAuthEndpoint(options))
  }

  if (webhookSecrets.size > 0) {
    endpoints.push(getStreamWebhookEndpoint(options, webhookSecrets))
  }

  if ([...options.collections.values()].some((collection) => collection.stream?.status)) {
    endpoints.push(getStreamStatusEndpoint(options, webhookSecrets))
  }

  if (
    [...options.collections.values()].some(
      (collection) => collection.stream && collection.thumbnail && !collection.disablePayloadAccessControl,
    )
  ) {
    endpoints.push(getStreamThumbnailEndpoint(options))
  }

  return endpoints
}
