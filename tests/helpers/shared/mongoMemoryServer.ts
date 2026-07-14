import { MongoMemoryServer } from 'mongodb-memory-server'

import { log } from './log.js'

declare global {
  var _mongoMemoryServer: MongoMemoryServer | undefined
}

export const startMongoMemoryServer = async (dbName?: string): Promise<MongoMemoryServer> => {
  if (global._mongoMemoryServer) {
    log.info('Reusing MongoDB Memory Server')
    process.env.DATABASE_URI = global._mongoMemoryServer.getUri(dbName)
    return global._mongoMemoryServer
  }

  log.info('Starting MongoDB Memory Server...')

  const mongoServer = await MongoMemoryServer.create()

  global._mongoMemoryServer = mongoServer
  process.env.DATABASE_URI = mongoServer.getUri(dbName)

  log.success('MongoDB Memory Server started')

  return mongoServer
}

export const stopMongoMemoryServer = async (): Promise<void> => {
  if (global._mongoMemoryServer) {
    log.info('Stopping MongoDB Memory Server...')
    try {
      await global._mongoMemoryServer.stop()
      global._mongoMemoryServer = undefined
      log.success('MongoDB Memory Server stopped')
    } catch (error) {
      log.error(`MongoDB stop error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
