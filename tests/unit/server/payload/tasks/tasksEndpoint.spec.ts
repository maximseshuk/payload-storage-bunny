import { beforeEach, describe, expect, it, vi } from 'vitest'

const { cleanupMock, syncMock } = vi.hoisted(() => ({
  cleanupMock: vi.fn(),
  syncMock: vi.fn(),
}))

vi.mock('@/server/payload/tasks/runStreamCleanup.js', () => ({ runStreamCleanup: cleanupMock }))
vi.mock('@/server/payload/tasks/syncStreamStatus.js', () => ({ syncStreamStatus: syncMock }))

const { createNormalizedOptions } = await import('@/server/payload/options/normalizer.js')
const { tasksOperations } = await import('@/server/payload/openapi.js')
const { getTasksEndpoints } = await import('@/server/payload/tasks/endpoint.js')

const { createOwnStream } = await import('../../../../helpers/unit/optionsBuilders.js')

const SECRET = 'a-secret-of-32-characters-length'

const buildOptions = ({ cleanup = true, secret = SECRET, sync = true } = {}) =>
  createNormalizedOptions({
    collections: {
      videos: { disablePayloadAccessControl: true, stream: createOwnStream(111, { cleanup, status: { sync } }) },
    },
    tasks: { secret },
  } as never)

const call = async ({
  adminAccess,
  authorization,
  method = 'get',
  options = buildOptions(),
  search = '',
  task = 'status-sync',
  user,
}: {
  adminAccess?: (args: { req: unknown }) => boolean | Promise<boolean>
  authorization?: string
  method?: 'get' | 'post'
  options?: ReturnType<typeof buildOptions>
  search?: string
  task?: string
  user?: { collection: string; role?: string }
}) => {
  const endpoint = getTasksEndpoints(options).find((entry) => entry.method === method)
  const error = vi.fn()
  const payload = {
    collections: { users: { config: { access: { admin: adminAccess } } } },
    config: { admin: { user: 'users' } },
    logger: { error, warn: vi.fn() },
  }
  const response = await endpoint!.handler({
    headers: new Headers(authorization ? { authorization } : {}),
    payload,
    routeParams: { task },
    searchParams: new URLSearchParams(search),
    user,
  } as never)
  return { body: await response.json(), error, payload, status: response.status }
}

describe('tasks endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    syncMock.mockResolvedValue({ checked: 2, failed: 0, hasMore: false, updated: 1 })
    cleanupMock.mockResolvedValue({ deletedCount: 3, errorCount: 0, hasMore: false })
  })

  it('registers GET and POST only when tasks.secret is set', () => {
    const endpoints = getTasksEndpoints(buildOptions())
    expect(endpoints.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'get /storage-bunny/tasks/:task',
      'post /storage-bunny/tasks/:task',
    ])
    expect(endpoints[0]!.custom?.openapi).toBe(tasksOperations.get)
    expect(endpoints[1]!.custom?.openapi).toBe(tasksOperations.post)
    expect(tasksOperations.get.security).toEqual([{ tasksSecret: [] }])
    expect(getTasksEndpoints(buildOptions({ secret: '' }))).toEqual([])
  })

  it.each([
    { authorization: undefined, name: 'no header' },
    { authorization: 'Bearer short', name: 'a secret of the wrong length' },
    { authorization: `Bearer ${'x'.repeat(SECRET.length)}`, name: 'a wrong secret' },
    { authorization: SECRET, name: 'the secret without Bearer' },
  ])('answers 401 for $name', async ({ authorization }) => {
    const { body, status } = await call({ authorization })
    expect(status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
    expect(syncMock).not.toHaveBeenCalled()
  })

  it('answers 401 for a user of another auth collection', async () => {
    expect((await call({ method: 'post', user: { collection: 'customers' } })).status).toBe(401)
  })

  it('answers 401 to GET with a session cookie and no secret', async () => {
    expect((await call({ user: { collection: 'users' } })).status).toBe(401)
    expect(syncMock).not.toHaveBeenCalled()
  })

  it('answers 401 to POST from a user that the admin access check rejects', async () => {
    const adminAccess = vi.fn(({ req }: { req: any }) => req.user.role === 'admin')
    const { status } = await call({ adminAccess, method: 'post', user: { collection: 'users', role: 'customer' } })
    expect(status).toBe(401)
    expect(adminAccess).toHaveBeenCalled()
    expect(syncMock).not.toHaveBeenCalled()
  })

  it.each(['get', 'post'] as const)('runs the task with the right secret on %s', async (method) => {
    const { body, payload, status } = await call({ authorization: `Bearer ${SECRET}`, method })
    expect(status).toBe(200)
    expect(body).toEqual({ checked: 2, failed: 0, hasMore: false, task: 'status-sync', updated: 1 })
    expect(syncMock).toHaveBeenCalledWith(expect.objectContaining({ limit: undefined, payload }))
  })

  it('runs the task on POST for an admin user', async () => {
    const { body, status } = await call({ method: 'post', task: 'cleanup', user: { collection: 'users' } })
    expect(status).toBe(200)
    expect(body).toEqual({ deletedCount: 3, errorCount: 0, hasMore: false, task: 'cleanup' })
  })

  it('runs the task on POST for a user that passes the admin access check', async () => {
    const adminAccess = vi.fn(async ({ req }: { req: any }) => req.user.role === 'admin')
    const { status } = await call({ adminAccess, method: 'post', user: { collection: 'users', role: 'admin' } })
    expect(status).toBe(200)
  })

  it('answers 404 for an unknown task', async () => {
    expect((await call({ authorization: `Bearer ${SECRET}`, task: 'reindex' })).status).toBe(404)
  })

  it('answers 404 for a task that is not turned on', async () => {
    const options = buildOptions({ cleanup: false })
    expect((await call({ authorization: `Bearer ${SECRET}`, options, task: 'cleanup' })).status).toBe(404)
    expect(cleanupMock).not.toHaveBeenCalled()
  })

  it('caps limit at 500', async () => {
    await call({ authorization: `Bearer ${SECRET}`, search: 'limit=9000' })
    expect(syncMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 500 }))
  })

  it('rejects a limit that is not a positive integer', async () => {
    expect((await call({ authorization: `Bearer ${SECRET}`, search: 'limit=0' })).status).toBe(400)
    expect((await call({ authorization: `Bearer ${SECRET}`, search: 'limit=abc' })).status).toBe(400)
  })

  it('skips a task that is already running and runs it again once the first run ends', async () => {
    let finish: (value: unknown) => void = () => {}
    syncMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const first = call({ authorization: `Bearer ${SECRET}` })

    const second = await call({ authorization: `Bearer ${SECRET}` })
    expect(second.status).toBe(200)
    expect(second.body).toEqual({ hasMore: false, skipped: true, task: 'status-sync' })
    expect((await call({ authorization: `Bearer ${SECRET}`, task: 'cleanup' })).body).toMatchObject({ deletedCount: 3 })
    expect(syncMock).toHaveBeenCalledTimes(1)

    finish({ checked: 1, failed: 0, hasMore: false, updated: 1 })
    expect((await first).body).toMatchObject({ checked: 1 })
    expect((await call({ authorization: `Bearer ${SECRET}` })).body).toMatchObject({ checked: 2 })
  })

  it('answers 500 and logs when the task throws', async () => {
    syncMock.mockRejectedValue(new Error('boom'))
    const { body, error, status } = await call({ authorization: `Bearer ${SECRET}` })
    expect(status).toBe(500)
    expect(body).toEqual({ error: 'Internal server error' })
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ msg: '[bunny:tasks] status-sync: run failed' }))
  })
})
