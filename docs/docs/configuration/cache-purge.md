# Cache Purge

The CDN caches your files at edge locations around the world. When you replace a file, visitors might still see the old cached copy. `purge` tells Bunny to invalidate the cached copy immediately after every upload and delete.

```ts title="payload.config.ts"
bunnyStorage({
  accountApiKey: process.env.BUNNY_ACCOUNT_API_KEY, // required for purge
  collections: { media: true },
  storage: {/* ... */},
  purge: true, // enable with defaults
})
```

## Options

| Option  | Type      | Default | Description                                                                 |
| ------- | --------- | ------- | --------------------------------------------------------------------------- |
| `async` | `boolean` | `false` | If `true`, the upload/delete request does not wait for the purge to finish. |

Pass `purge: true` for defaults, `purge: false` to disable, or an object to customize:

```ts
purge: {
  async: true,
}
```

## Requirements

Cache purging is an account-level operation, so it needs a Bunny **account** API key (not the Storage or Stream key) at the top level, as `accountApiKey`:

```ts title="payload.config.ts"
bunnyStorage({
  accountApiKey: process.env.BUNNY_ACCOUNT_API_KEY,
  purge: true,
  // ...
})
```

Get it from your Bunny dashboard → account menu (top-right) → **Account settings** → **API** → copy the API key.

:::warning
Without a global `accountApiKey`, the config validator throws a startup error — including when only individual collections enable `purge`.

Purging is only performed for Bunny **Storage** files — it does not apply to Stream videos, which are served from Bunny's video CDN and cached differently.
:::

## Alternative: timestamp-based cache busting

If you don't want to manage an account API key, [`urlTransform.appendTimestamp`](/configuration/url-transforms) or [`thumbnail.appendTimestamp`](/configuration/thumbnails) add a changing query parameter to URLs instead. This is simpler to set up, but only busts the cache for browsers that re-fetch the URL — it does not proactively clear Bunny's edge cache.

| Approach                              | Setup                 | Effect                                                       |
| ------------------------------------- | --------------------- | ------------------------------------------------------------ |
| Cache purging (`purge`)               | Needs `accountApiKey` | Immediate, global invalidation on every change               |
| Timestamp busting (`appendTimestamp`) | No extra credentials  | Only helps once a client re-requests the (now different) URL |

## Collection overrides

```ts
collections: {
  images: {
    purge: false, // disable purging for this collection
  },
  documents: {
    purge: {
      async: true, // override async for this collection
    },
  },
}
```

See [Collection overrides](/configuration/collection-overrides) for the full list of options you can tune per collection.
