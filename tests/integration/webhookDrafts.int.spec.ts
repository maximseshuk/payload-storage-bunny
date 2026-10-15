import { createHmac, randomBytes } from 'node:crypto'

import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { BunnyStreamVideoStatus, getReadyResolutions, getStreamVideo } from '@/server/bunny/stream.js'
import { writeStoredVersionStream } from '@/server/payload/stream/storedStream.js'

import { getPayload } from '../helpers/int/getPayload.js'
import { hasBunnyCredentials } from '../helpers/shared/credentials.js'

vi.mock('@/server/bunny/stream.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/bunny/stream.js')>()
  return {
    ...actual,
    getReadyResolutions: vi.fn(actual.getReadyResolutions),
    getStreamVideo: vi.fn(actual.getStreamVideo),
  }
})

describe.skipIf(!hasBunnyCredentials())('Stream webhook for a draft-only video', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload('webhookDrafts')
  })

  afterAll(async () => {
    await payload.destroy()
  })

  const callWebhook = async (body: object) => {
    const endpoint = payload.config.endpoints?.find((e) => e.path === '/storage-bunny/stream/webhook')
    if (!endpoint) {
      throw new Error('Webhook endpoint not found')
    }

    const rawBody = JSON.stringify(body)
    const headers = new Headers({
      'Content-Type': 'application/json',
      'x-bunnystream-signature': createHmac('sha256', 'test-webhook-secret').update(rawBody).digest('hex'),
      'x-bunnystream-signature-algorithm': 'hmac-sha256',
      'x-bunnystream-signature-version': 'v1',
    })

    return endpoint.handler({
      headers,
      payload,
      text: async () => rawBody,
      url: 'http://localhost/api/storage-bunny/stream/webhook',
    } as any)
  }

  const collection = 'webhook-rich-drafts'
  const resolutions = { available: ['720p'], highest: '720p' }

  const versionsOf = async (id: number | string) =>
    (
      await payload.db.findVersions({
        collection,
        pagination: false,
        sort: '-updatedAt',
        where: { parent: { equals: id } },
      })
    ).docs

  const createDraftOnlyVideo = async (label: string) => {
    const publishedVideoId = `rich-published-${label}-${Date.now()}`
    const draftVideoId = `rich-draft-${label}-${Date.now()}`
    const created = await payload.db.create({
      collection,
      data: {
        _status: { de: 'published', en: 'published' },
        alt: 'Published alt',
        bunnyData: { stream: { status: 'ready', videoId: publishedVideoId } },
        filename: `${publishedVideoId}.mp4`,
        items: [{ id: randomBytes(12).toString('hex'), label: 'one' }],
        mimeType: 'video/mp4',
        title: { de: 'Titel', en: 'Title' },
      },
    })
    vi.mocked(getStreamVideo).mockResolvedValueOnce({
      availableResolutions: null,
      guid: draftVideoId,
      status: BunnyStreamVideoStatus.Transcoding,
      storageSize: 1,
      title: 'Rich draft video',
    } as any)
    await payload.update({
      id: created.id,
      autosave: true,
      collection,
      data: {
        bunnyData: { stream: { status: 'processing', videoId: draftVideoId } },
        items: [{ label: 'one' }, { label: 'two' }],
        title: 'Entwurf',
      } as any,
      draft: true,
      locale: 'de',
      overrideAccess: true,
    })
    return { created, draftVideoId }
  }

  const remove = async (id: number | string) => {
    vi.mocked(getStreamVideo).mockReset()
    vi.mocked(getReadyResolutions).mockReset()
    await payload.db.deleteVersions({ collection, where: { parent: { equals: id } } })
    await payload.db.deleteOne({ collection, where: { id: { equals: id } } })
  }

  it('changes only the stream of the draft version', async () => {
    const { created, draftVideoId } = await createDraftOnlyVideo('webhook')

    try {
      const before = await versionsOf(created.id)
      const latest = before[0]! as any
      expect(latest).toMatchObject({ autosave: true, latest: true })
      expect(latest.version.items.map((item: any) => item.label)).toEqual(['one', 'two'])
      expect(latest.version.items.every((item: any) => item.id)).toBe(true)
      expect(latest.version.bunnyData.stream).toMatchObject({ status: 'processing', videoId: draftVideoId })
      vi.mocked(getReadyResolutions).mockResolvedValueOnce(resolutions)

      const response = await callWebhook({
        Status: 3,
        VideoGuid: draftVideoId,
        VideoLibraryId: parseInt(process.env.BUNNY_STREAM_LIBRARY_ID || '0'),
      })
      expect(response.status).toBe(200)

      expect(await versionsOf(created.id)).toEqual([
        {
          ...latest,
          version: {
            ...latest.version,
            bunnyData: { stream: { ...latest.version.bunnyData.stream, resolutions, status: 'ready' } },
          },
        },
        ...before.slice(1),
      ])
      for (const [locale, title] of [
        ['de', 'Entwurf'],
        ['en', 'Title'],
      ]) {
        const draft = await payload.findByID({ id: created.id, collection, draft: true, locale, overrideAccess: true })
        expect(draft).toMatchObject({ title })
        expect((draft.bunnyData as any).stream).toMatchObject({ resolutions, status: 'ready', videoId: draftVideoId })
      }
    } finally {
      await remove(created.id)
    }
  }, 30000)

  it.each([
    ['writes the stream over the fresh version when an autosave kept the state', 'processing', true],
    ['does not write over a version when an autosave stored another state', 'failed', false],
  ] as const)(
    '%s after the read',
    async (_label, autosavedStatus, expected) => {
      const { created, draftVideoId } = await createDraftOnlyVideo(`guard-${autosavedStatus}`)
      const findVersions = payload.db.findVersions
      const spy = vi.spyOn(payload.db, 'findVersions')

      try {
        const before = await versionsOf(created.id)
        const row = before[0]! as any
        const autosaved = {
          ...row,
          updatedAt: new Date(Date.parse(row.updatedAt) + 1000).toISOString(),
          version: {
            ...row.version,
            alt: 'Autosaved alt',
            bunnyData: { stream: { ...row.version.bunnyData.stream, status: autosavedStatus } },
          },
        }
        spy.mockImplementationOnce(async (args) => {
          const result = await findVersions.call(payload.db, args)
          await payload.db.updateVersion({
            id: row.id,
            collection,
            versionData: {
              createdAt: autosaved.createdAt,
              latest: autosaved.latest,
              parent: autosaved.parent,
              updatedAt: autosaved.updatedAt,
              version: structuredClone(autosaved.version),
            },
          })
          return result as any
        })

        const written = await writeStoredVersionStream({
          collection,
          id: row.id,
          req: { payload } as any,
          stream: { resolutions, status: 'ready', videoId: draftVideoId },
          whenStatus: 'processing',
        })
        spy.mockRestore()

        expect(written).toBe(expected)
        const after = await versionsOf(created.id)
        expect(after).toHaveLength(before.length)
        expect(after).toEqual([
          expected
            ? {
                ...autosaved,
                version: {
                  ...autosaved.version,
                  bunnyData: { stream: { ...autosaved.version.bunnyData.stream, resolutions, status: 'ready' } },
                },
              }
            : autosaved,
          ...before.slice(1),
        ])
      } finally {
        spy.mockRestore()
        await remove(created.id)
      }
    },
    30000,
  )

  it('keeps an older version not the latest when a new version is saved between the read and the write', async () => {
    const { created, draftVideoId } = await createDraftOnlyVideo('latest')
    const findVersions = payload.db.findVersions
    const spy = vi.spyOn(payload.db, 'findVersions')

    try {
      const [row] = (await versionsOf(created.id)) as any[]
      expect(row.latest).toBe(true)
      spy.mockImplementationOnce(async (args) => {
        const result = await findVersions.call(payload.db, args)
        vi.mocked(getStreamVideo).mockResolvedValueOnce({
          availableResolutions: null,
          guid: draftVideoId,
          status: BunnyStreamVideoStatus.Transcoding,
          storageSize: 1,
          title: 'Rich draft video',
        } as any)
        await payload.update({
          id: created.id,
          collection,
          data: { alt: 'Newer draft' },
          draft: true,
          locale: 'en',
          overrideAccess: true,
        })
        return result as any
      })

      const written = await writeStoredVersionStream({
        collection,
        id: row.id,
        req: { payload } as any,
        stream: { resolutions, status: 'ready', videoId: draftVideoId },
        whenStatus: 'processing',
      })
      spy.mockRestore()

      expect(written).toBe(true)
      const after = (await versionsOf(created.id)) as any[]
      const older = after.find((version) => version.id === row.id)
      expect(older.latest).not.toBe(true)
      expect(older.version.bunnyData.stream).toMatchObject({ resolutions, status: 'ready' })
      expect(after.filter((version) => version.latest === true).map((version) => version.version.alt)).toEqual([
        'Newer draft',
      ])
    } finally {
      spy.mockRestore()
      await remove(created.id)
    }
  }, 30000)
})
