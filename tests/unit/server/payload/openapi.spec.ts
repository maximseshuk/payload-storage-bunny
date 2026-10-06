import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { OpenAPIV3_1 } from '@scalar/openapi-types'
import { describe, expect, it } from 'vitest'

import { bunnyGroupField } from '@/server/payload/fields/bunnyGroupField.js'
import {
  bunnyDataFieldOpenApi,
  openApiDocument,
  streamStatusOperation,
  streamWebhookOperation,
  tusAuthOperation,
} from '@/server/payload/openapi.js'
import { createNormalizedOptions } from '@/server/payload/options/normalizer.js'
import { getStreamEndpoints } from '@/server/payload/stream/endpoints.js'
import { MAX_LIMIT } from '@/server/payload/tasks/endpoint.js'
import { BUNNY_TASK_NAMES } from '@/server/payload/tasks/run.js'
import type { CollectionContext } from '@/shared/types/index.js'

describe('openapi metadata', () => {
  it('attaches custom.openapi to the stream endpoints', () => {
    const options = createNormalizedOptions({
      collections: { media: { disablePayloadAccessControl: true } },
      stream: {
        apiKey: 'stream-key',
        hostname: 'stream.bunny.net',
        libraryId: 12345,
        tus: true,
        webhook: { secret: 'hook-secret' },
      },
    })

    const endpoints = getStreamEndpoints(options)
    const tusAuth = endpoints.find((endpoint) => endpoint.path === '/storage-bunny/stream/tus-auth')
    const webhook = endpoints.find((endpoint) => endpoint.path === '/storage-bunny/stream/webhook')
    const status = endpoints.find((endpoint) => endpoint.path === '/storage-bunny/stream/status/:collection/:id')

    expect(tusAuth?.custom?.openapi).toBe(tusAuthOperation)
    expect(webhook?.custom?.openapi).toBe(streamWebhookOperation)
    expect(status?.custom?.openapi).toBe(streamStatusOperation)
  })

  it('attaches custom.openapi to the bunnyData field', () => {
    const field = bunnyGroupField({} as CollectionContext, true)
    expect(field.custom?.openapi).toBe(bunnyDataFieldOpenApi)
  })

  it('declares the task security schemes and matches the task names and limit of the tasks endpoint', () => {
    expect(openApiDocument.components?.securitySchemes).toMatchObject({
      payloadToken: { in: 'cookie', name: 'payload-token', type: 'apiKey' },
      tasksSecret: { scheme: 'bearer', type: 'http' },
    })

    const path = openApiDocument.paths?.['/api/storage-bunny/tasks/{task}']
    expect(Object.keys(path ?? {})).toEqual(['get', 'post'])

    const parameters = (path?.post?.parameters ?? []) as OpenAPIV3_1.ParameterObject[]
    const schemaOf = (name: string) =>
      parameters.find((parameter) => parameter.name === name)?.schema as OpenAPIV3_1.SchemaObject
    expect(schemaOf('task').enum).toEqual([...BUNNY_TASK_NAMES])
    const limit = parameters.find((parameter) => parameter.name === 'limit')
    expect(limit?.description).toContain(`above ${MAX_LIMIT} becomes ${MAX_LIMIT}`)
  })

  it('matches the committed docs/v4/api-reference/openapi.json (run pnpm docs:openapi)', () => {
    const root = resolve(import.meta.dirname, '../../../..')
    const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }
    const committed = JSON.parse(readFileSync(resolve(root, 'docs/v4/api-reference/openapi.json'), 'utf8'))

    expect(committed).toEqual(
      JSON.parse(JSON.stringify({ ...openApiDocument, info: { ...openApiDocument.info, version } })),
    )
  })
})
