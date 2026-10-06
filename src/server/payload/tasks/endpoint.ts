import { timingSafeEqual } from 'node:crypto'

import type { Endpoint, PayloadHandler, PayloadRequest } from 'payload'

import { tasksOperations } from '@/server/payload/openapi.js'
import { isAdminUser } from '@/server/payload/options/access.js'
import { isBunnyTaskEnabled, runBunnyTask } from '@/server/payload/tasks/run.js'
import { jsonResponse } from '@/shared/http.js'
import type { NormalizedBunnyStorageOptions } from '@/shared/types/index.js'

export const MAX_LIMIT = 500

const hasSecret = (req: PayloadRequest, secret: string): boolean => {
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export const getTasksEndpoints = (options: NormalizedBunnyStorageOptions): Endpoint[] => {
  const secret = options.tasks?.secret
  if (!secret) {
    return []
  }

  const getHandler =
    (method: 'get' | 'post'): PayloadHandler =>
    async (req) => {
      if (!hasSecret(req, secret) && !(method === 'post' && (await isAdminUser(req)))) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }

      const task = String(req.routeParams?.task ?? '')
      if (!isBunnyTaskEnabled(options, task)) {
        return jsonResponse({ error: 'Not found' }, 404)
      }

      const rawLimit = req.searchParams.get('limit')
      let limit: number | undefined
      if (rawLimit !== null) {
        limit = Number(rawLimit)
        if (!Number.isInteger(limit) || limit < 1) {
          return jsonResponse({ error: 'limit must be a positive integer' }, 400)
        }
        limit = Math.min(limit, MAX_LIMIT)
      }

      try {
        const result = await runBunnyTask({ limit, payload: req.payload, req, task })
        return jsonResponse({ task, ...result })
      } catch (err) {
        req.payload.logger.error({ err, msg: `[bunny:tasks] ${task}: run failed` })
        return jsonResponse({ error: 'Internal server error' }, 500)
      }
    }

  return (['get', 'post'] as const).map((method) => ({
    custom: { openapi: tasksOperations[method] },
    handler: getHandler(method),
    method,
    path: '/storage-bunny/tasks/:task',
  }))
}
