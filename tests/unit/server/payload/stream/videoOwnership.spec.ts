import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { getStreamVideoMock } = vi.hoisted(() => ({ getStreamVideoMock: vi.fn() }))

vi.mock('@/server/bunny/stream.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getStreamVideo: getStreamVideoMock,
}))

const { bunnyStorage } = await import('../../../../../src/index.js')
const { buildConfigWithDefaults } = await import('../../../../helpers/shared/buildConfigWithDefaults.js')
const { createMediaCollection } = await import('../../../../helpers/shared/createMediaCollection.js')

const FIRST_SLUG = 'ownership-first-videos'
const SECOND_SLUG = 'ownership-second-videos'
const OTHER_LIBRARY_SLUG = 'ownership-other-library-videos'

describe('Stream video ownership', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({
      config: await buildConfigWithDefaults({
        collections: [
          createMediaCollection({ slug: FIRST_SLUG }),
          createMediaCollection({ slug: SECOND_SLUG }),
          createMediaCollection({ slug: OTHER_LIBRARY_SLUG }),
        ],
        storage: [
          bunnyStorage({
            collections: {
              [FIRST_SLUG]: { disablePayloadAccessControl: true },
              [OTHER_LIBRARY_SLUG]: {
                disablePayloadAccessControl: true,
                stream: { apiKey: 'other', hostname: 'other.b-cdn.net', libraryId: 2, tus: true },
              },
              [SECOND_SLUG]: { disablePayloadAccessControl: true },
            },
            stream: { apiKey: 'x', hostname: 'stream.b-cdn.net', libraryId: 1, tus: true },
          }),
        ],
      }),
      key: 'stream-video-ownership',
    })
  })

  afterAll(async () => {
    await payload?.destroy?.()
  })

  beforeEach(() => {
    getStreamVideoMock.mockImplementation(async ({ videoId }: { videoId: string }) => ({
      guid: videoId,
      status: 4,
      storageSize: 10,
      title: `${videoId}.mp4`,
    }))
  })

  const alreadyUsed = {
    data: {
      errors: [{ message: 'This video is already used by another document.', path: 'bunnyData.stream.videoId' }],
    },
  }

  const createWithVideo = (collection: string, videoId: string) =>
    payload.create({
      collection: collection as typeof FIRST_SLUG,
      data: { alt: 'a', bunnyData: { stream: { videoId } } } as never,
      overrideAccess: true,
    })

  it('rejects a video another collection of the same library already uses', async () => {
    await createWithVideo(FIRST_SLUG, 'shared-video')
    await expect(createWithVideo(SECOND_SLUG, 'shared-video')).rejects.toMatchObject(alreadyUsed)
  })

  it('rejects a video another document of the same collection already uses', async () => {
    await createWithVideo(FIRST_SLUG, 'same-collection-video')
    await expect(createWithVideo(FIRST_SLUG, 'same-collection-video')).rejects.toMatchObject(alreadyUsed)
  })

  it('accepts the same video id in a collection of another library', async () => {
    await createWithVideo(FIRST_SLUG, 'library-video')
    await expect(createWithVideo(OTHER_LIBRARY_SLUG, 'library-video')).resolves.toBeDefined()
  })

  it('lets a document keep its own video on update', async () => {
    const doc = await createWithVideo(FIRST_SLUG, 'own-video')
    await expect(
      payload.update({
        collection: FIRST_SLUG as never,
        data: { alt: 'b', bunnyData: { stream: { videoId: 'own-video' } } } as never,
        id: doc.id,
        overrideAccess: true,
      }),
    ).resolves.toBeDefined()
  })
})
