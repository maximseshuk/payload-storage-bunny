import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

let server: null | PGLiteSocketServer = null
let db: null | PGlite = null

const PORT = 55433

export const startPgliteServer = async (): Promise<string> => {
  db = await PGlite.create()
  server = new PGLiteSocketServer({ db, host: '127.0.0.1', maxConnections: 8, port: PORT })
  await server.start()
  return `postgresql://postgres@127.0.0.1:${PORT}/postgres`
}

export const stopPgliteServer = async (): Promise<void> => {
  if (server) {
    await server.stop()
    server = null
  }
  if (db) {
    await db.close()
    db = null
  }
}
