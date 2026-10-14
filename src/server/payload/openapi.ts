import type { OpenAPIV3_1 } from '@scalar/openapi-types'

export const tusAuthOperation: OpenAPIV3_1.OperationObject = {
  description:
    'Creates the video and its TUS upload in Bunny Stream with the declared `filesize`, and returns the upload URL with short-lived TUS headers so the browser can send the file directly to Bunny. Call it again with `videoId` and `videoToken` to resume the upload, or also with `renew: true` to get new headers for it. Access is gated by `stream.tus.access` or the built-in rule. See [TUS uploads](/v4/configuration/stream/tus).',
  requestBody: {
    content: {
      'application/json': {
        schema: {
          properties: {
            collection: { description: 'Target upload collection.', type: 'string' },
            filename: { description: 'Original file name.', type: 'string' },
            filesize: {
              description: 'File size in bytes. Bunny accepts only this number of bytes for the upload.',
              type: 'number',
            },
            filetype: { description: 'File MIME type.', type: 'string' },
            renew: {
              description:
                'Renew mode, for an upload in progress. Returns new headers for the same upload, or `uploaded` when it has finished. Never creates a video: when the upload cannot be renewed, the endpoint answers 409.',
              type: 'boolean',
            },
            title: { description: 'Title of a new video. Defaults to `filename`.', type: 'string' },
            videoId: {
              description:
                'Existing Bunny video GUID, to resume an upload or renew its headers. Used only with a matching `videoToken` and the same `filesize`.',
              type: 'string',
            },
            videoToken: { description: 'The `videoToken` returned with `videoId`.', type: 'string' },
          },
          required: ['collection', 'filename', 'filesize', 'filetype'],
          type: 'object',
        },
      },
    },
    required: true,
  },
  responses: {
    '200': {
      content: {
        'application/json': {
          schema: {
            properties: {
              expiresIn: {
                description:
                  'Returned with `upload`. Number of seconds the `headers` stay valid, counted from the response. Use it instead of `AuthorizationExpire`, so the client clock does not matter.',
                type: 'number',
              },
              headers: {
                additionalProperties: { type: 'string' },
                description:
                  'Returned with `upload`. Send these headers with every TUS request: `AuthorizationExpire`, `AuthorizationSignature`, `LibraryId` and `VideoId`. They are valid for `expiresIn` seconds, at most 5 minutes. Before they expire, call this endpoint again with `videoId`, `videoToken` and `renew: true` to get new ones.',
                type: 'object',
              },
              libraryId: { description: 'Bunny Stream library the video lives in.', type: 'number' },
              title: {
                description: 'Returned with `uploaded`. Title of the video in Bunny, or `filename`.',
                type: 'string',
              },
              type: {
                description:
                  '`upload` returns the upload to send the file to; `uploaded` means the upload is complete or the video already exists.',
                enum: ['upload', 'uploaded'],
                type: 'string',
              },
              uploadUrl: {
                description:
                  'Returned with `upload`. TUS upload URL that the server created. Send only `HEAD` and `PATCH` requests to it.',
                type: 'string',
              },
              videoId: { description: 'Bunny video GUID.', type: 'string' },
              videoToken: {
                description:
                  'Token bound to `videoId` and the signed-in user, valid for 24 hours. Send it as `bunnyData.stream.videoToken` when saving the document, and with `videoId` to resume.',
                type: 'string',
              },
            },
            type: 'object',
          },
        },
      },
      description:
        'The upload URL and TUS headers for a new or resumed upload, or `uploaded` when the upload is complete or the video is already processed.',
    },
    '400': {
      description:
        'Missing required fields, an invalid file name, MIME type or size, an SVG or XML file, a missing title for a new video, or Stream TUS uploads not enabled for the collection.',
    },
    '403': { description: 'Access denied.' },
    '404': { description: 'The collection does not exist or is not managed by the plugin.' },
    '409': {
      description:
        'Renew mode only: the upload cannot be renewed. The video token is invalid, the video or its upload is gone, or `filesize` differs from the upload. Start a new upload without `renew`.',
    },
    '413': { description: 'The file exceeds `upload.limits.fileSize`.' },
    '415': { description: 'The file type is restricted or not accepted by the collection or the Stream options.' },
    '500': {
      description: 'Unexpected failure, such as a Bunny Stream API error. Details are hidden from the response.',
    },
  },
  summary: 'Create or resume a TUS upload session',
  tags: ['Bunny Stream'],
}

export const streamWebhookOperation: OpenAPIV3_1.OperationObject = {
  description:
    'Receives encoding-status callbacks from Bunny Stream. The plugin maps `Status` to the stored encoding state in `bunnyData.stream.status` and writes it only when it changes: 0, 1, 2, 4, 6 and 7 mean `processing`, 3 means `ready`, 5 and 8 mean `failed`, other codes change nothing. A `processing` status never replaces a stored `ready` or `failed` state. On completion (status 3, with `mp4Fallback` enabled) the plugin also fills in `bunnyData.stream.resolutions`. Authenticated by an HMAC signature, not a Payload session. Set the webhook URL in your Bunny Stream library to this path. See [Webhooks](/v4/configuration/stream/webhooks).',
  parameters: [
    {
      description:
        "Lowercase-hex HMAC-SHA256 of the exact raw request body, keyed by the library's Read-Only API key (`stream.webhook.secret`).",
      in: 'header',
      name: 'X-BunnyStream-Signature',
      required: true,
      schema: { type: 'string' },
    },
    {
      description: 'Signature scheme version. Must be `v1`.',
      in: 'header',
      name: 'X-BunnyStream-Signature-Version',
      required: true,
      schema: { enum: ['v1'], type: 'string' },
    },
    {
      description: 'Signature algorithm. Must be `hmac-sha256`.',
      in: 'header',
      name: 'X-BunnyStream-Signature-Algorithm',
      required: true,
      schema: { enum: ['hmac-sha256'], type: 'string' },
    },
  ],
  requestBody: {
    content: {
      'application/json': {
        schema: {
          properties: {
            Status: { description: 'Bunny encoding status code.', type: 'number' },
            VideoGuid: { description: 'Bunny video GUID.', type: 'string' },
            VideoLibraryId: { description: 'Bunny Stream library ID.', type: 'number' },
          },
          required: ['Status', 'VideoGuid', 'VideoLibraryId'],
          type: 'object',
        },
      },
    },
    required: true,
  },
  responses: {
    '200': { description: 'Acknowledged.' },
    '400': { description: 'Invalid payload.' },
    '401': {
      description:
        'Missing or invalid signature, unsupported signature version/algorithm, or a library without a configured webhook secret.',
    },
    '500': {
      description:
        'Reading or storing the document failed, or Bunny has no MP4 resolutions yet, so Bunny can send the webhook again.',
    },
  },
  security: [],
  summary: 'Bunny Stream encoding-status webhook',
  tags: ['Bunny Stream'],
}

export const streamStatusOperation: OpenAPIV3_1.OperationObject = {
  description:
    "Returns the encoding state of a document's Bunny Stream video. The user must be able to open the admin panel (a user of the admin user collection who passes its `access.admin`), and the document is read with Payload access control, so the user also needs read access to it. `videoId` must be the video of the document, or of its latest draft when the collection has drafts and the user can read that draft. Trashed documents count. A stored `ready` or `failed` state is returned without a Bunny API call. Otherwise the server asks the Bunny API, at most once per video every 10 seconds (60 seconds when the library has a webhook), and stores a changed state. A video that Bunny no longer has is `failed`, but only when the library itself still answers. The media-preview adapter and the sidebar card poll this while the video is processing. The endpoint exists only when at least one collection stores the status (`stream.status`, on by default). See [Media preview](/v4/guides/media-preview).",
  parameters: [
    {
      description: 'Upload collection slug.',
      in: 'path',
      name: 'collection',
      required: true,
      schema: { type: 'string' },
    },
    {
      description: 'Document ID.',
      in: 'path',
      name: 'id',
      required: true,
      schema: { type: 'string' },
    },
    {
      description:
        'Bunny video GUID. It must match the video of the document, or of its latest draft when the collection has drafts.',
      in: 'path',
      name: 'videoId',
      required: true,
      schema: { type: 'string' },
    },
  ],
  responses: {
    '200': {
      content: {
        'application/json': {
          schema: {
            properties: {
              resolutions: {
                description:
                  'MP4 renditions, the same value as `bunnyData.stream.resolutions`. Left out when none are stored.',
                properties: {
                  available: { items: { type: 'string' }, type: 'array' },
                  highest: { type: 'string' },
                },
                type: 'object',
              },
              state: {
                description:
                  '`ready` when the video can play, `processing` while Bunny encodes it, `failed` when encoding or the upload failed.',
                enum: ['failed', 'processing', 'ready'],
                type: 'string',
              },
            },
            required: ['state'],
            type: 'object',
          },
        },
      },
      description: 'Encoding state of the video.',
    },
    '401': { description: 'Not signed in.' },
    '403': { description: 'The user cannot open the admin panel or has no read access to the document.' },
    '404': {
      description:
        'The collection does not exist, is not managed by the plugin, has no Bunny Stream or does not store the status (`stream.status: false`), the document does not exist, or neither the document nor its latest draft has the video `videoId`.',
    },
    '500': {
      description: 'Unexpected failure, such as a Bunny Stream API error. Details are hidden from the response.',
    },
  },
  summary: 'Get the encoding state of a Stream video',
  tags: ['Bunny Stream'],
}

export const streamThumbnailOperation: OpenAPIV3_1.OperationObject = {
  description:
    "Returns the thumbnail of a document's Bunny Stream video. The `thumbnailURL` field points here when Payload access control is on (`disablePayloadAccessControl` is not `true`). The document is read with Payload access control, so the caller needs read access to it; no sign-in is needed when the collection allows public reads. `videoId` must be the video of the document, or of its latest draft when the collection has drafts and the caller can read that draft. Trashed documents count. The server fetches the image from the Stream CDN, signed when `signedUrls` is on, or redirects to a signed CDN URL when `signedUrls.staticHandler.redirect` is set and `signedUrls.shouldUseSignedUrl` does not return `false`. The redirect is sent with `Cache-Control: no-cache, no-store, must-revalidate`. The proxied image is sent with `Cache-Control: private` and `Vary: Cookie, Authorization`, so shared caches do not store it. Query parameters, such as Bunny Image Optimizer options, are passed on to the CDN. Payload upload transformers never handle this route. The endpoint exists only when at least one collection has Bunny Stream, `thumbnail` and Payload access control. See [Thumbnails](/v4/configuration/thumbnails).",
  parameters: [
    {
      description: 'Upload collection slug.',
      in: 'path',
      name: 'collection',
      required: true,
      schema: { type: 'string' },
    },
    {
      description: 'Document ID.',
      in: 'path',
      name: 'id',
      required: true,
      schema: { type: 'string' },
    },
    {
      description:
        'Bunny video GUID. It must match the video of the document, or of its latest draft when the collection has drafts.',
      in: 'path',
      name: 'videoId',
      required: true,
      schema: { type: 'string' },
    },
    {
      description: '`thumbnail.jpg` for the still frame, `preview.webp` for the animated preview.',
      in: 'path',
      name: 'file',
      required: true,
      schema: { enum: ['preview.webp', 'thumbnail.jpg'], type: 'string' },
    },
  ],
  responses: {
    '200': {
      content: {
        'image/jpeg': { schema: { format: 'binary', type: 'string' } },
        'image/webp': { schema: { format: 'binary', type: 'string' } },
      },
      description: 'The thumbnail image.',
    },
    '302': {
      description:
        'Redirect to a signed CDN URL, when `signedUrls.staticHandler.redirect` is set and its `status` is 302 (the default).',
    },
    '304': { description: 'Not modified since the cached copy named in `If-None-Match` or `If-Modified-Since`.' },
    '307': {
      description:
        'Redirect to a signed CDN URL, when `signedUrls.staticHandler.redirect` is set and its `status` is 307.',
    },
    '403': { description: 'No read access to the document.' },
    '404': {
      description:
        "Unknown `file`, the collection does not exist, is not managed by the plugin, has no Bunny Stream or `thumbnail`, turns off Payload access control, the document does not exist, neither the document nor its latest draft has the video `videoId`, or the CDN has no thumbnail for it. Other CDN errors return the CDN's status code.",
    },
    '500': { description: 'Unexpected failure. Details are hidden from the response.' },
  },
  security: [{}, { payloadToken: [] }],
  summary: 'Get the thumbnail of a Stream video',
  tags: ['Bunny Stream'],
}

const tasksOperation: OpenAPIV3_1.OperationObject = {
  description:
    'Runs a background task now and returns its counts. Use it from a cron service when Payload jobs do not run. `GET` needs `Authorization: Bearer <tasks.secret>`. `POST` also accepts a signed-in user of the admin user collection who passes its `access.admin`. The endpoint exists only when `tasks.secret` is set. When `hasMore` is `true`, call it again. See [Background tasks](/v4/configuration/background-tasks).',
  parameters: [
    {
      description: 'Task to run.',
      in: 'path',
      name: 'task',
      required: true,
      schema: { enum: ['cleanup', 'status-sync'], type: 'string' },
    },
    {
      description:
        '`status-sync` only. Documents loaded per database query. A value above 500 becomes 500. Defaults to `stream.status.sync.limit`. `cleanup` ignores it, but still checks it.',
      in: 'query',
      name: 'limit',
      required: false,
      schema: { minimum: 1, type: 'integer' },
    },
  ],
  responses: {
    '200': {
      content: {
        'application/json': {
          schema: {
            properties: {
              checked: { description: '`status-sync`: videos whose state Bunny returned.', type: 'number' },
              deletedCount: { description: '`cleanup`: videos and stale sessions deleted.', type: 'number' },
              errorCount: { description: '`cleanup`: sessions that failed.', type: 'number' },
              failed: { description: '`status-sync`: videos that could not be checked.', type: 'number' },
              hasMore: {
                description:
                  '`true` when there is more work left: the run reached its time budget, `cleanup` found more upload sessions than one run takes, or Bunny returned 429 to `status-sync`.',
                type: 'boolean',
              },
              skipped: {
                description:
                  '`true` when the same task was already running in this process, so this call did nothing. Other counts are left out.',
                type: 'boolean',
              },
              task: { enum: ['cleanup', 'status-sync'], type: 'string' },
              updated: { description: '`status-sync`: documents whose stored status changed.', type: 'number' },
            },
            required: ['task', 'hasMore'],
            type: 'object',
          },
        },
      },
      description: 'The task ran, or was skipped because it was already running.',
    },
    '400': { description: '`limit` is not a positive integer.' },
    '401': {
      description:
        'No valid `Authorization` header, and for `POST` no signed-in admin user. Checked before the task name, so an unknown task also returns 401.',
    },
    '404': { description: 'Unknown task, or the task is not turned on.' },
    '500': { description: 'The task failed. Details are in the server log with the `[bunny:tasks]` prefix.' },
  },
  security: [{ tasksSecret: [] }, { payloadToken: [] }],
  summary: 'Run a background task',
  tags: ['Background tasks'],
}

export const tasksOperations = {
  get: { ...tasksOperation, security: [{ tasksSecret: [] }] },
  post: tasksOperation,
} satisfies Record<'get' | 'post', OpenAPIV3_1.OperationObject>

export const bunnyDataFieldOpenApi: OpenAPIV3_1.SchemaObject = {
  description:
    'Bunny-managed metadata for this upload. Omitted when no video is attached; otherwise a discriminated union keyed by `type` (currently only `"stream"`).',
}

export const openApiDocument: Omit<OpenAPIV3_1.Document, 'info'> & {
  info: Omit<OpenAPIV3_1.InfoObject, 'version'>
} = {
  components: {
    securitySchemes: {
      payloadToken: {
        description:
          'Payload authentication cookie. Each endpoint checks Payload access control for the signed-in user; see the endpoint for what it needs.',
        in: 'cookie',
        name: 'payload-token',
        type: 'apiKey',
      },
      tasksSecret: {
        description: 'The `tasks.secret` plugin option, sent as `Authorization: Bearer <secret>`.',
        scheme: 'bearer',
        type: 'http',
      },
    },
  },
  info: {
    description:
      'HTTP endpoints the plugin registers on your Payload app under `/api`. The admin UI calls these for you; document and drive them yourself only if you build a custom upload flow.',
    title: 'Payload Storage Bunny — Plugin API',
  },
  openapi: '3.1.0',
  paths: {
    '/api/storage-bunny/stream/status/{collection}/{id}/{videoId}': { get: streamStatusOperation },
    '/api/storage-bunny/stream/thumbnail/{collection}/{id}/{videoId}/{file}': { get: streamThumbnailOperation },
    '/api/storage-bunny/stream/tus-auth': { post: tusAuthOperation },
    '/api/storage-bunny/stream/webhook': { post: streamWebhookOperation },
    '/api/storage-bunny/tasks/{task}': tasksOperations,
  },
  security: [{ payloadToken: [] }],
  servers: [{ description: 'Your Payload app origin', url: 'https://your-site.com' }],
}
