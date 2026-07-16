# URL Transforms

`urlTransform` rewrites the public URL the plugin generates for a file — add query parameters, a cache-busting timestamp, or take full control with a custom function.

```ts title="payload.config.ts"
bunnyStorage({
  collections: { media: true },
  storage: {/* ... */},
  urlTransform: {
    queryParams: { optimized: 'true' },
  },
})
```

## Simple transform

| Option            | Type                     | Default | Description                                                                       |
| ----------------- | ------------------------ | ------- | --------------------------------------------------------------------------------- |
| `appendTimestamp` | `boolean`                | `false` | Append a `t=<timestamp>` query parameter to bust browser/CDN cache after updates. |
| `queryParams`     | `Record<string, string>` | `{}`    | Static query parameters appended to the URL.                                      |

```ts
urlTransform: {
  appendTimestamp: true,
  queryParams: {
    version: '2',
  },
}
```

## Custom transform function

For full control, provide `transformUrl` instead. It replaces `appendTimestamp` and `queryParams` — you build the URL yourself.

```ts
urlTransform: {
  transformUrl: ({ baseUrl, filename }) => {
    const size = filename.includes('large') ? '600' : '300'
    return `${baseUrl}?width=${size}&quality=90`
  },
}
```

The function receives:

| Argument     | Type                                   | Description                                                                |
| ------------ | -------------------------------------- | -------------------------------------------------------------------------- |
| `baseUrl`    | `string`                               | The URL the plugin generated before any transform.                         |
| `collection` | `CollectionConfig`                     | The Payload collection config.                                             |
| `filename`   | `string`                               | The file's base filename.                                                  |
| `prefix`     | `string \| undefined`                  | The collection or document's storage path prefix.                          |
| `data`       | `Record<string, unknown> \| undefined` | The document data. For Stream videos, includes `bunnyData.stream.videoId`. |

Return the final URL string.

## Requirement

:::warning
`urlTransform` only applies to documents served through Payload's access control. It has no effect on a collection with `disablePayloadAccessControl: true`, since those files link straight to the Bunny CDN outside of Payload's field pipeline.
:::

## Collection overrides

```ts
collections: {
  avatars: {
    urlTransform: {
      transformUrl: ({ baseUrl }) => `${baseUrl}?width=150&height=150`,
    },
  },
  documents: {
    urlTransform: false, // disable transform for this collection
  },
}
```

See [Collection overrides](/configuration/collection-overrides) for the full list of options you can tune per collection, and [Thumbnails](/configuration/thumbnails) for the equivalent transform on thumbnail URLs.
