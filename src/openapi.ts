import type { OpenAPIV3_1 } from '@scalar/openapi-types'

export const tusAuthOperation: OpenAPIV3_1.OperationObject = {
  description:
    'Creates the video in Bunny Stream (if needed) and returns a signed TUS authorization so the browser can upload directly to Bunny. Access is gated by `stream.tus.checkAccess` or the built-in rule. See [TUS uploads](/configuration/stream/tus).',
  requestBody: {
    content: {
      'application/json': {
        schema: {
          properties: {
            collection: { description: 'Target upload collection.', type: 'string' },
            filename: { description: 'Original file name.', type: 'string' },
            filesize: { description: 'File size in bytes.', type: 'number' },
            filetype: { description: 'File MIME type.', type: 'string' },
            title: { description: 'Video title. Required when creating a new video.', type: 'string' },
            videoId: { description: 'Existing Bunny video GUID, to resume an upload.', type: 'string' },
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
              libraryId: { description: 'Bunny Stream library the video lives in.', type: 'number' },
              thumbnailTime: { description: 'Thumbnail capture time (ms), when configured.', type: 'number' },
              type: {
                description: '`upload` returns a signature to proceed; `uploaded` means the video already exists.',
                enum: ['upload', 'uploaded'],
                type: 'string',
              },
              videoId: { description: 'Bunny video GUID.', type: 'string' },
            },
            type: 'object',
          },
        },
      },
      description:
        'TUS authorization for a new/resumed upload, or an `uploaded` short-circuit when the video is already processed.',
    },
    '400': { description: 'Missing required fields, or a missing title for a new video.' },
    '403': { description: 'Access denied.' },
    '500': { description: 'Bunny Stream is not configured for the collection.' },
  },
  summary: 'Create or resume a TUS upload session',
  tags: ['Bunny Stream'],
}

export const streamWebhookOperation: OpenAPIV3_1.OperationObject = {
  description:
    'Receives encoding-status callbacks from Bunny Stream. On completion (with `mp4Fallback` enabled) the plugin fills in `bunnyData.stream.resolutions`. Authenticated by an HMAC signature, not a Payload session. Set the webhook URL in your Bunny Stream library to this path. See [Webhooks](/configuration/stream/webhooks).',
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
    '401': { description: 'Missing or invalid signature, or unsupported signature version/algorithm.' },
    '403': { description: 'Library ID not configured on this app.' },
  },
  security: [],
  summary: 'Bunny Stream encoding-status webhook',
  tags: ['Bunny Stream'],
}

export const clientUploadOperation: OpenAPIV3_1.OperationObject = {
  description:
    "Returns a short-lived signed (edge) or presigned (S3) URL so the browser can `PUT` file bytes straight to Bunny. Runs the collection's `clientUploads.access` check and validates the file against `upload.mimeTypes` and `upload.limits.fileSize`. See [Client uploads](/configuration/storage/client-uploads).",
  requestBody: {
    content: {
      'application/json': {
        schema: {
          properties: {
            collectionSlug: { description: 'Target upload collection.', type: 'string' },
            filename: { description: 'Original file name.', type: 'string' },
            filesize: { description: 'File size in bytes.', type: 'number' },
            mimeType: { description: 'File MIME type.', type: 'string' },
          },
          required: ['collectionSlug', 'filename', 'mimeType'],
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
              filename: { description: 'Sanitized file name.', type: 'string' },
              method: { examples: ['PUT'], type: 'string' },
              prefix: { description: 'Resolved storage path prefix the file lands under.', type: 'string' },
              url: { description: 'Signed/presigned URL to `PUT` the file to.', type: 'string' },
            },
            type: 'object',
          },
        },
      },
      description: 'Signed upload URL and the resolved storage path.',
    },
    '403': { description: 'Client uploads disabled for the collection, or access denied.' },
    '413': { description: 'File exceeds the size limit.' },
    '415': { description: 'Disallowed MIME type.' },
  },
  summary: 'Mint a client-upload URL',
  tags: ['Bunny Storage'],
}

export const bunnyDataFieldOpenApi: OpenAPIV3_1.SchemaObject = {
  description:
    'Bunny-managed metadata for this upload. `null` when no video is attached; otherwise a discriminated union keyed by `type` (currently only `"stream"`).',
}

export const openApiDocument: OpenAPIV3_1.Document = {
  components: {
    securitySchemes: {
      payloadToken: {
        description:
          'Payload authentication cookie. These endpoints run Payload access control; an authenticated admin session is required.',
        in: 'cookie',
        name: 'payload-token',
        type: 'apiKey',
      },
    },
  },
  info: {
    description:
      'HTTP endpoints the plugin registers on your Payload app under `/api`. The admin UI calls these for you; document and drive them yourself only if you build a custom upload flow.',
    title: 'Payload Storage Bunny — Plugin API',
    version: '3.0.0',
  },
  openapi: '3.1.0',
  paths: {
    '/api/storage-bunny/storage/upload': { post: clientUploadOperation },
    '/api/storage-bunny/stream/tus-auth': { post: tusAuthOperation },
    '/api/storage-bunny/stream/webhook': { post: streamWebhookOperation },
  },
  security: [{ payloadToken: [] }],
  servers: [{ description: 'Your Payload app origin', url: 'https://your-site.com' }],
}
