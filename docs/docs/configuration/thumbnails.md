# Thumbnails

`thumbnail` populates a hidden `thumbnailURL` field on your upload documents, which the admin panel uses to show a preview image in list and edit views, and which is available in every API response.

```ts title="payload.config.ts"
bunnyStorage({
  collections: { media: true },
  storage: {/* ... */},
  thumbnail: true, // enable with defaults
})
```

- **Images** — uses the original file, or a specific size if `sizeName` is set.
- **Bunny Stream videos** — uses the frame captured at [`stream.thumbnailTime`](/configuration/stream#options).

## Options

| Option            | Type                     | Default | Description                                                                                                                                                                                                                                                      |
| ----------------- | ------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sizeName`        | `string`                 | –       | Use a named image size from your collection's `imageSizes` instead of the original file. Falls back to the original if the size is missing on a given document.                                                                                                  |
| `streamAnimated`  | `boolean`                | `false` | For Stream videos, use an animated WebP preview (`preview.webp`) instead of a static JPEG (`thumbnail.jpg`).                                                                                                                                                     |
| `appendTimestamp` | `boolean`                | `true`  | Append a `t=<timestamp>` query parameter so browsers fetch the latest thumbnail after a file changes. Thumbnails default to `true` (unlike [`urlTransform.appendTimestamp`](/configuration/url-transforms), which defaults to `false`). Pass `false` to opt out. |
| `queryParams`     | `Record<string, string>` | `{}`    | Static query parameters appended to the thumbnail URL — handy for [Bunny's Image Optimizer](https://docs.bunny.net/docs/stream-image-optimization?ref=fndfoymy0j).                                                                                               |

## Cache-busting with appendTimestamp

Thumbnails have `appendTimestamp` **on by default**. When a file is replaced (for example, during image cropping), the timestamp changes and browsers fetch the new version instead of a cached copy. While it is enabled, the plugin also disables Payload's cache tags for the thumbnail field, to avoid caching conflicts.

Opt out per config if you don't want it:

```ts
thumbnail: {
  appendTimestamp: false,
}
```

:::tip
To make this effective on Bunny's side too, go to your Pull Zone → **Caching** → enable **Vary Cache** for **URL Query String**, and add `t` to the vary parameter list.

If you need immediate cache invalidation everywhere instead of relying on the browser refetching, use [cache purging](/configuration/cache-purge).
:::

## Resizing with queryParams

```ts
thumbnail: {
  queryParams: {
    width: '300',
    height: '300',
    quality: '85',
  },
}
```

## Using a named image size

```ts
thumbnail: {
  sizeName: 'thumbnail', // matches a size defined in upload.imageSizes
  appendTimestamp: true,
}
```

## Custom transform function

`thumbnail` accepts the same URL-transform options as [`urlTransform`](/configuration/url-transforms). For full control over the thumbnail URL, provide `transformUrl` instead of `appendTimestamp`/`queryParams` — it replaces them, and you build the URL yourself. `sizeName` and `streamAnimated` still apply.

```ts
thumbnail: {
  sizeName: 'thumbnail',
  transformUrl: ({ baseUrl }) => `${baseUrl}?class=thumb`,
}
```

The function receives the same arguments as [`urlTransform.transformUrl`](/configuration/url-transforms#custom-transform-function) (`baseUrl`, `collection`, `filename`, `prefix`, `data`) and returns the final URL string.

## Collection overrides

```ts
collections: {
  gallery: {
    thumbnail: {
      sizeName: 'thumbnail',
    },
  },
  documents: {
    thumbnail: false, // no thumbnails for this collection
  },
}
```

See [Collection overrides](/configuration/collection-overrides) for the full list of options you can tune per collection.
