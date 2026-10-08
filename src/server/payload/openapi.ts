import type { OpenAPIV3_1 } from '@scalar/openapi-types'

export const tusAuthOperation: OpenAPIV3_1.OperationObject = {
  description:
    'Creates the video in Bunny Stream (if needed) and returns a signed TUS authorization so the browser can upload directly to Bunny. Access is gated by `stream.tus.access` or the built-in rule. See [TUS uploads](/v4/configuration/stream/tus).',
  requestBody: {
    content: {
      'application/json': {
        schema: {
          properties: {
            collection: { description: 'Target upload collection.', type: 'string' },
            filename: { description: 'Original file name.', type: 'string' },
            filesize: { description: 'File size in bytes.', type: 'number' },
            filetype: { description: 'File MIME type.', type: 'string' },
            head: {
              description:
                'Base64 of the first bytes of the file (at most 8192 characters). When sent, the response includes a `filename` and a `signedReceipt` for a client-direct upload.',
              type: 'string',
            },
            title: { description: 'Title of a new video. Defaults to `filename`.', type: 'string' },
            videoId: {
              description: 'Existing Bunny video GUID, to resume an upload. Used only with a matching `videoToken`.',
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
              authorizationExpire: {
                description: 'Signature expiry as a UNIX timestamp (seconds).',
                type: 'number',
              },
              authorizationSignature: { description: 'SHA-256 TUS authorization signature.', type: 'string' },
              filename: {
                description:
                  'Returned when the request includes `head`. Unique sanitized file name the `signedReceipt` is bound to; submit the file under this name.',
                type: 'string',
              },
              libraryId: { description: 'Bunny Stream library the video lives in.', type: 'number' },
              signedReceipt: {
                description:
                  'Returned when the request includes `head`. Send it as `uploadReference.signedReceipt` of the file submitted with the Payload document.',
                type: 'string',
              },
              thumbnailTime: { description: 'Thumbnail capture time (ms), when configured.', type: 'number' },
              title: {
                description: 'Returned with `uploaded`. Title of the video in Bunny, or `filename`.',
                type: 'string',
              },
              type: {
                description: '`upload` returns a signature to proceed; `uploaded` means the video already exists.',
                enum: ['upload', 'uploaded'],
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
        'TUS authorization for a new/resumed upload, or an `uploaded` short-circuit when the video is already processed.',
    },
    '400': {
      description:
        'Missing required fields, an invalid `head`, file name, MIME type or size, an SVG or XML file, a missing title for a new video, or Stream TUS uploads not enabled for the collection.',
    },
    '403': { description: 'Access denied.' },
    '404': { description: 'The collection does not exist.' },
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
    "Returns the encoding state of a document's Bunny Stream video. The user must be able to open the admin panel (a user of the admin user collection who passes its `access.admin`), and the document is read with Payload access control, so the user also needs read access to it. A stored `ready` or `failed` state is returned without a Bunny API call. Otherwise the server asks the Bunny API, at most once per video every 10 seconds (60 seconds when the library has a webhook), and stores a changed state. A video that Bunny no longer has is `failed`, but only when the library itself still answers. The media-preview adapter and the sidebar card poll this while the video is processing. The endpoint exists only when at least one collection stores the status (`stream.status`, on by default). See [Media preview](/v4/guides/media-preview).",
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
        'The collection does not exist, is not managed by the plugin, has no Bunny Stream or does not store the status (`stream.status: false`), the document does not exist, or it has no Stream video.',
    },
    '500': {
      description: 'Unexpected failure, such as a Bunny Stream API error. Details are hidden from the response.',
    },
  },
  summary: 'Get the encoding state of a Stream video',
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
          'Payload authentication cookie. These endpoints run Payload access control; an authenticated admin session is required.',
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
    '/api/storage-bunny/stream/status/{collection}/{id}': { get: streamStatusOperation },
    '/api/storage-bunny/stream/tus-auth': { post: tusAuthOperation },
    '/api/storage-bunny/stream/webhook': { post: streamWebhookOperation },
    '/api/storage-bunny/tasks/{task}': tasksOperations,
  },
  security: [{ payloadToken: [] }],
  servers: [{ description: 'Your Payload app origin', url: 'https://your-site.com' }],
}
