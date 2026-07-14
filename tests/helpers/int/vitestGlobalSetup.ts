import { startMongoMemoryServer, stopMongoMemoryServer } from '../shared/mongoMemoryServer.js'

let teardownHappened = false

export const setup = async () => {
  process.env.PAYLOAD_DROP_DATABASE = 'true'

  const mongoServer = await startMongoMemoryServer()
  process.env.MONGODB_MEMORY_SERVER_URI = mongoServer.getUri()
}

export const teardown = async () => {
  if (teardownHappened) {
    throw new Error('teardown called twice')
  }
  teardownHappened = true

  await stopMongoMemoryServer()
}
