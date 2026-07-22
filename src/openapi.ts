type OpenApiOperation = Record<string, unknown>

export const tusAuthOperation: OpenApiOperation = {
  requestBody: {
    content: {
      'application/json': {
        schema: {
          properties: {
            collection: { type: 'string' },
            filename: { type: 'string' },
            filesize: { type: 'number' },
            filetype: { type: 'string' },
            title: { type: 'string' },
            videoId: { type: 'string' },
          },
          required: ['collection', 'filename', 'filetype', 'filesize'],
          type: 'object',
        },
      },
    },
    required: true,
  },
  responses: {
    '200': { description: 'TUS auth signature, or an "uploaded" short-circuit when the video is already processed' },
    '400': { description: 'Missing required fields, or a missing title for a new video' },
    '403': { description: 'Access denied' },
    '500': { description: 'Stream is not configured' },
  },
  summary: 'Create or resume a TUS resumable upload session for Bunny Stream',
  tags: ['Bunny Stream'],
}

export const streamWebhookOperation: OpenApiOperation = {
  parameters: [
    {
      description: 'Lowercase-hex HMAC-SHA256 of the raw request body, keyed by the library Read-Only API key.',
      in: 'header',
      name: 'X-BunnyStream-Signature',
      required: true,
      schema: { type: 'string' },
    },
    { in: 'header', name: 'X-BunnyStream-Signature-Version', required: true, schema: { enum: ['v1'], type: 'string' } },
    {
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
            Status: { type: 'number' },
            VideoGuid: { type: 'string' },
            VideoLibraryId: { type: 'number' },
          },
          type: 'object',
        },
      },
    },
  },
  responses: {
    '200': { description: 'Acknowledged' },
    '400': { description: 'Invalid payload' },
    '401': { description: 'Missing or invalid signature, or unsupported signature version/algorithm' },
    '403': { description: 'Library ID mismatch' },
  },
  security: [],
  summary: 'Bunny Stream encoding-status webhook',
  tags: ['Bunny Stream'],
}

export const clientUploadOperation: OpenApiOperation = {
  requestBody: {
    content: {
      'application/json': {
        schema: {
          properties: {
            collectionSlug: { type: 'string' },
            filename: { type: 'string' },
            filesize: { type: 'number' },
            mimeType: { type: 'string' },
          },
          required: ['collectionSlug', 'filename', 'mimeType'],
          type: 'object',
        },
      },
    },
    required: true,
  },
  responses: {
    '200': { description: 'Presigned PUT URL, method, and final storage path' },
    '403': { description: 'Client uploads disabled or access denied' },
    '413': { description: 'File exceeds the size limit' },
    '415': { description: 'Disallowed mime type' },
  },
  summary: 'Mint a presigned upload URL for direct browser-to-Bunny client uploads',
  tags: ['Bunny Storage'],
}

export const bunnyDataFieldOpenApi: OpenApiOperation = {
  description:
    'Bunny-managed metadata for this upload. `null` when no video is attached; otherwise a discriminated union keyed by `type` (currently only `"stream"`).',
}
