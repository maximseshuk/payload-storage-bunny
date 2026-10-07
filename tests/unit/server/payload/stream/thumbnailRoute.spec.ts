import { sharpTransformer } from '@payloadcms/transformer-sharp'
import type { Payload } from 'payload'
import { getPayload, handleEndpoints } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { httpFetchMock } = vi.hoisted(() => ({ httpFetchMock: vi.fn() }))

vi.mock('@/server/http/index.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  httpFetch: httpFetchMock,
}))

const { bunnyStorage } = await import('@/index.js')
const { buildConfigWithDefaults } = await import('../../../../helpers/shared/buildConfigWithDefaults.js')
const { createMediaCollection } = await import('../../../../helpers/shared/createMediaCollection.js')
const { devUser } = await import('../../../../helpers/shared/buildConfigWithDefaults.js')

const CACHE_KEY = 'stream-thumbnail-route'
const SLUG = 'thumb-route-media'
const DRAFTS_SLUG = 'thumb-route-drafts'
const VIDEO_ID = '11111111-2222-3333-4444-555555555555'
const DRAFT_VIDEO_ID = '99999999-2222-3333-4444-555555555555'

describe('Stream thumbnail through the Payload REST pipeline with an upload transformer', () => {
  let payload: Payload
  let id: number | string
  let draftsId: number | string
  let auth: Record<string, string>

  const get = (path: string, headers: Record<string, string> = {}) =>
    handleEndpoints({
      config: payload.config,
      payloadInstanceCacheKey: CACHE_KEY,
      request: new Request(new URL(path, 'http://localhost'), { headers }),
    })

  const readThumbnailURL = async (path: string) =>
    ((await (await get(path, auth)).json()) as { thumbnailURL: string }).thumbnailURL

  const fetchedVideo = () => new URL(httpFetchMock.mock.calls[0][0] as string).pathname.split('/')[1]

  beforeAll(async () => {
    payload = await getPayload({
      config: await buildConfigWithDefaults({
        admin: {},
        collections: [
          createMediaCollection({ slug: SLUG }),
          createMediaCollection({
            slug: DRAFTS_SLUG,
            access: { read: ({ req }) => (req.user ? true : { _status: { equals: 'published' } }) },
            trash: true,
            versions: { drafts: true },
          }),
        ],
        storage: [
          bunnyStorage({
            collections: { [DRAFTS_SLUG]: { stream: {} }, [SLUG]: { stream: {} } },
            stream: { apiKey: 'k', hostname: 'stream.example.com', libraryId: 1, mp4Fallback: true },
            thumbnail: { urlTransform: { queryParams: { width: '300' } } },
          }),
        ],
        upload: { transformers: [sharpTransformer({ dynamic: true })] },
      }),
      key: CACHE_KEY,
    })

    const doc = await payload.db.create({
      collection: SLUG,
      data: {
        alt: 'a',
        bunnyData: { stream: { status: 'ready', videoId: VIDEO_ID }, type: 'stream' },
        filename: 'clip.mp4',
        mimeType: 'video/mp4',
      },
    })
    id = doc.id

    const draftsDoc = await payload.db.create({
      collection: DRAFTS_SLUG,
      data: {
        _status: 'published',
        alt: 'a',
        bunnyData: { stream: { videoId: VIDEO_ID } },
        filename: 'clip.mp4',
        mimeType: 'video/mp4',
      },
    })
    draftsId = draftsDoc.id
    await payload.update({
      id: draftsId,
      collection: DRAFTS_SLUG,
      context: { skipCloudStorage: true },
      data: { bunnyData: { stream: { videoId: DRAFT_VIDEO_ID } } } as never,
      draft: true,
      overrideAccess: true,
    })

    const { token } = await payload.login({ collection: 'users', data: devUser })
    auth = { Authorization: `JWT ${token}` }
  })

  afterAll(async () => {
    await payload?.destroy?.()
  })

  beforeEach(() => {
    httpFetchMock.mockReset()
    httpFetchMock.mockResolvedValue(new Response('jpeg', { headers: { 'content-type': 'image/jpeg' }, status: 200 }))
  })

  it('serves the thumbnailURL from the REST response through the plugin endpoint', async () => {
    const docResponse = await get(`/api/${SLUG}/${id}`)
    const { thumbnailURL } = (await docResponse.json()) as { thumbnailURL: string }

    expect(
      thumbnailURL.startsWith(`/api/storage-bunny/stream/thumbnail/${SLUG}/${id}/${VIDEO_ID}/thumbnail.jpg?`),
    ).toBe(true)

    const response = await get(thumbnailURL)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('jpeg')
    const fetched = new URL(httpFetchMock.mock.calls[0][0] as string)
    expect(`${fetched.origin}${fetched.pathname}`).toBe(`https://stream.example.com/${VIDEO_ID}/thumbnail.jpg`)
    expect(fetched.searchParams.get('width')).toBe('300')
  })

  it('returns 404 for the old synthetic file URL, which the transformer pipeline cannot resolve', async () => {
    const response = await get(`/api/${SLUG}/file/${encodeURIComponent(`bunny:stream:${VIDEO_ID}:thumbnail.jpg`)}`)

    expect(response.status).toBe(404)
    expect(httpFetchMock).not.toHaveBeenCalled()
  })

  it('serves the published video for the document and the new video for its latest draft', async () => {
    const publishedURL = await readThumbnailURL(`/api/${DRAFTS_SLUG}/${draftsId}`)
    const draftURL = await readThumbnailURL(`/api/${DRAFTS_SLUG}/${draftsId}?draft=true`)

    expect(publishedURL).toContain(`/${VIDEO_ID}/thumbnail.jpg`)
    expect(draftURL).toContain(`/${DRAFT_VIDEO_ID}/thumbnail.jpg`)

    expect((await get(draftURL, auth)).status).toBe(200)
    expect(fetchedVideo()).toBe(DRAFT_VIDEO_ID)
    httpFetchMock.mockClear()
    expect((await get(publishedURL)).status).toBe(200)
    expect(fetchedVideo()).toBe(VIDEO_ID)
  })

  it('does not serve the draft video to a caller who can read only the published document', async () => {
    const response = await get(
      `/api/storage-bunny/stream/thumbnail/${DRAFTS_SLUG}/${draftsId}/${DRAFT_VIDEO_ID}/thumbnail.jpg`,
    )

    expect(response.status).toBe(404)
    expect(httpFetchMock).not.toHaveBeenCalled()
  })

  it('serves the thumbnail of a trashed document', async () => {
    const trashed = await payload.db.create({
      collection: DRAFTS_SLUG,
      data: {
        _status: 'published',
        alt: 'a',
        bunnyData: { stream: { videoId: VIDEO_ID } },
        deletedAt: new Date().toISOString(),
        filename: 'trashed.mp4',
        mimeType: 'video/mp4',
      },
    })

    const response = await get(
      `/api/storage-bunny/stream/thumbnail/${DRAFTS_SLUG}/${trashed.id}/${VIDEO_ID}/thumbnail.jpg`,
      auth,
    )

    expect(response.status).toBe(200)
    expect(fetchedVideo()).toBe(VIDEO_ID)
  })
})
