import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'

import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { DatabaseAdapterObj } from 'payload'

let mongoServer: Promise<MongoMemoryServer> | undefined

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })

const startPglite = async (): Promise<string> => {
  const db = await PGlite.create()
  const port = await freePort()
  await new PGLiteSocketServer({ db, host: '127.0.0.1', maxConnections: 8, port }).start()
  return `postgresql://postgres@127.0.0.1:${port}/postgres`
}

export const testDatabase = async (): Promise<DatabaseAdapterObj> => {
  const testDb = process.env.TEST_DB ?? 'sqlite'
  switch (testDb) {
    case 'mongodb': {
      mongoServer ??= MongoMemoryServer.create()
      return mongooseAdapter({ url: (await mongoServer).getUri(`psb-test-${randomUUID()}`) })
    }
    case 'postgres':
      return postgresAdapter({ pool: { connectionString: await startPglite() } })
    case 'sqlite':
      return sqliteAdapter({ client: { url: process.env.DATABASE_URL || 'file::memory:' } })
    default:
      throw new Error(`Unknown TEST_DB "${testDb}"; use sqlite, postgres or mongodb`)
  }
}
