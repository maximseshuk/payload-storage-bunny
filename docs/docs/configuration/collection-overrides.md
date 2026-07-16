# Collection overrides

Every collection listed under `collections` can use the global config as-is, or override individual options. This lets you keep one plugin config while giving each collection different behavior.

```ts
collections: {
  media: true,       // use all global settings
  videos: {
    prefix: 'videos',
    disablePayloadAccessControl: true,
    stream: {
      thumbnailTime: 3000,
    },
  },
}
```

## Collection options

| Option                        | Type                | Default          | Description                                                                                                                                                                                                                                                                           |
| ----------------------------- | ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prefix`                      | `string`            | `''` (zone root) | Folder path inside Bunny Storage, e.g. `prefix: 'images'` stores files under an "images" folder. Defaults to the zone root (empty string).                                                                                                                                            |
| `disablePayloadAccessControl` | `boolean`           | `false`          | `true` serves files directly from the Bunny CDN, bypassing Payload's access rules. `false` (default) proxies every request through Payload.                                                                                                                                           |
| `storage`                     | `object \| false`   | inherits global  | Partial override (`uploadTimeout`, `clientUploads`), a full config (own `apiKey`/`hostname`/`zoneName`) to use its own zone, or `false` to disable. See [Storage](/configuration/storage#collection-overrides).                                                                       |
| `stream`                      | `object \| false`   | inherits global  | Partial override (`mimeTypes`, `mp4Fallback`, `thumbnailTime`, `uploadTimeout`, `tus` — or `tus: false` to disable TUS), a full config (own `apiKey`/`hostname`/`libraryId`) to use its own library, or `false` to disable. See [Stream](/configuration/stream#collection-overrides). |
| `storage.clientUploads`       | `boolean \| object` | inherits global  | Enable, disable, or override browser-direct uploads for this collection. See [Client uploads](/configuration/storage/client-uploads#per-collection-client-uploads).                                                                                                                   |
| `purge`                       | `boolean \| object` | inherits global  | Override `async`, or `false` to disable purging. See [Cache purging](/configuration/cache-purge#collection-overrides).                                                                                                                                                                |
| `signedUrls`                  | `boolean \| object` | inherits global  | Override signed URL settings, or `false` to disable. See [Signed URLs](/configuration/signed-urls#collection-overrides).                                                                                                                                                              |
| `thumbnail`                   | `boolean \| object` | inherits global  | Override thumbnail settings, or `false` to disable. See [Thumbnails](/configuration/thumbnails#collection-overrides).                                                                                                                                                                 |
| `urlTransform`                | `boolean \| object` | inherits global  | Override URL rewriting, or `false` to disable. See [URL transforms](/configuration/url-transforms#collection-overrides).                                                                                                                                                              |

`prefix` and `disablePayloadAccessControl` come from `@payloadcms/plugin-cloud-storage` and apply to every collection using this plugin. `disableLocalStorage` cannot be passed here — the plugin always sets it to `true` on managed collections.

## Override surface: partial vs full replacement

Not every option can be tweaked in isolation. Some are **partially overridable** (merged onto the global zone/library); others exist **only inside a full replacement config** and can never be set on their own. The plugin flips `storage`/`stream` into full-replacement mode the moment the object contains `apiKey` — see [Own zone or library per collection](#own-zone-or-library-per-collection).

| Option                                                                 | Partially overridable?                                   | Full-replace only?                 | Notes                                                                            |
| ---------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| `storage.uploadTimeout`                                                | yes                                                      | —                                  | Merged onto the global zone.                                                     |
| `storage.clientUploads`                                                | yes                                                      | also settable inside a full config | Object merges `access`/`prefix`; the `edge` block replaces.                      |
| `storage.apiKey` / `hostname` / `zoneName`                             | no                                                       | yes — all three required together  | Presence of `apiKey` triggers full replacement.                                  |
| `storage.region` / `s3` / `tokenSecurityKey`                           | no                                                       | yes                                | Reachable only inside a full storage config.                                     |
| `stream.mimeTypes` / `mp4Fallback` / `thumbnailTime` / `uploadTimeout` | yes                                                      | —                                  | Merged onto the global library.                                                  |
| `stream.tus`                                                           | yes — `false` disables, `{ autoMode, expiresIn }` merges | —                                  | The object form only merges when the global `stream.tus` is enabled (see below). |
| `stream.tus.checkAccess`                                               | no                                                       | yes                                | The partial nested surface is `autoMode`/`expiresIn` only.                       |
| `stream.apiKey` / `hostname` / `libraryId`                             | no                                                       | yes — all three required together  | Presence of `apiKey` triggers full replacement.                                  |
| `stream.tokenSecurityKey` / `webhook` / `referer`                      | no                                                       | yes                                | Reachable only inside a full stream config.                                      |
| `stream.cleanup`                                                       | yes — `maxAge` only                                      | —                                  | The cleanup `schedule` is global-only.                                           |
| `purge`                                                                | yes — `false` / `true` / `{ async }`                     | —                                  | Merged onto the global purge config.                                             |
| `signedUrls`                                                           | yes — `false` / `true` / object                          | —                                  | Object merged field-by-field onto the global config (including `staticHandler`). |
| `thumbnail`                                                            | yes — `false` / `true` / object                          | —                                  | Merged onto the global thumbnail config.                                         |
| `urlTransform`                                                         | yes — `false` / `true` / object                          | —                                  | `transformUrl` replaces the simple `appendTimestamp`/`queryParams` options.      |
| `prefix` / `disablePayloadAccessControl`                               | collection-level                                         | —                                  | From `@payloadcms/plugin-cloud-storage`; set directly on the collection.         |

:::warning A partial `stream.tus` override needs global TUS enabled
A `stream: { tus: { … } }` partial override only applies when the global `stream.tus` is enabled — otherwise it is silently dropped. To turn TUS on for a single collection, either give that collection a full stream config, or enable `tus` globally and disable it per collection with `tus: false`.
:::

## How overrides merge

A **partial** override object (one without `apiKey`) is merged on top of the matching global option — it does not replace the whole block. An object that _includes_ `apiKey` is not a merge at all: it is a complete replacement of that zone/library, with every credential field required and nothing inherited — see [Own zone or library per collection](#own-zone-or-library-per-collection). For a partial override, for example:

```ts
// Global config
stream: {
  uploadTimeout: 300000,
  mp4Fallback: false,
}

// Collection override
collections: {
  largeVideos: {
    stream: {
      uploadTimeout: 600000, // only this changes
    },
  },
}

// Result for largeVideos: uploadTimeout 600000, mp4Fallback still false (inherited)
// Result for every other collection: uploadTimeout 300000, mp4Fallback false
```

## Own zone or library per collection

A collection's `storage` or `stream` can go beyond a partial override and supply a **full config** — its own `apiKey`, `hostname`, `zoneName` (storage) or `libraryId` (stream). That collection then uses its OWN Bunny zone / library, and the global one is ignored for it. This is how you point different collections at different tenants' zones and libraries.

```ts
collections: {
  // Full config → own storage zone + own stream library
  tenantA: {
    storage: {
      apiKey: process.env.TENANT_A_STORAGE_API_KEY,
      hostname: 'tenant-a.b-cdn.net',
      zoneName: 'tenant-a-zone',
    },
    stream: {
      apiKey: process.env.TENANT_A_STREAM_API_KEY,
      hostname: 'vz-tenant-a-123.b-cdn.net',
      libraryId: 654321,
    },
  },
}
```

The rules:

- **How it's detected.** The plugin treats the override as a full config when it contains `apiKey` (`'apiKey' in override`); otherwise it's a partial override merged onto the global config. `{ uploadTimeout: 5 }` is a partial override; `{ apiKey, hostname, zoneName }` is a full config.
- **No inheritance.** A full config inherits **nothing** from the global zone/library. Omitted optional keys (storage: `region`, `s3`, `tokenSecurityKey`, `clientUploads`, `uploadTimeout`; stream: `mimeTypes`, `mp4Fallback`, `tus`, `referer`, …) fall back to plugin defaults — never to the global config's values.
- **Signed URLs.** Provide that zone/library's own `tokenSecurityKey` when [signed URLs](/configuration/signed-urls) are enabled for the collection.
- **Webhooks.** A per-collection stream library can carry its own `webhook.secret`; the single webhook endpoint accepts every configured secret.
- **Cleanup.** Per-collection stream `cleanup` controls only `maxAge`. The cleanup `schedule` is global-only (one task for the whole plugin).
- **Client uploads travel with the zone.** A full storage config's `clientUploads` (including its `edge` script and secret) belongs to that zone and does not merge with the global `storage.clientUploads`.
- **Top-level optional.** Because a collection can own its whole zone/library, the top-level `storage`/`stream` are optional — a config made entirely of per-collection zones is valid.

:::warning Adding `apiKey` to a small tweak turns it into a full replacement
The trigger is purely the presence of `apiKey`, so an object you meant as a minor tweak becomes a complete replacement the moment you add credentials to it. For example, `stream: { apiKey, hostname, libraryId, uploadTimeout: 5 }` does **not** inherit `mimeTypes`, `mp4Fallback`, `tus`, `webhook`, or anything else from the global library — all of those reset to plugin defaults. If you only want to change `uploadTimeout` on the global library, leave `apiKey` out.
:::

The completeness of a full config is validated at startup: a full storage config needs `apiKey`/`hostname`/`zoneName`; a full stream config needs `apiKey`/`hostname`/`libraryId`. A single stream library must not be configured with conflicting `apiKey` values across collections.

## Disabling a service or feature: use `false`

Some options accept `false` to turn a feature off for one collection, even if it is enabled globally.

:::warning
This only works with an explicit `=== false` check, so always pass the literal `false` — an empty object or `undefined` means "inherit the global setting," not "disable."
:::

```ts title="payload.config.ts"
collections: {
  // Only Bunny Storage — video uploads are rejected
  images: {
    stream: false,
  },
  // Only Bunny Stream — non-video uploads fail
  videos: {
    storage: false,
  },
  // Both services enabled, but no signed URLs for this one
  publicMedia: {
    signedUrls: false,
  },
}
```

`purge`, `signedUrls`, `thumbnail`, `urlTransform`, `storage.clientUploads`, and `stream.tus` all support `false` this way. A collection must keep at least one of `storage` or `stream` active — disabling both is a config error.

## Enabling a collection with defaults

Pass `true` instead of an object to use every global setting unmodified:

```ts
collections: {
  media: true,
}
```

## Accessing the resolved config

Sometimes you need the settings the plugin resolved for a collection — the library id and API key for a Stream recipe, the zone name for a direct Storage call — from inside a hook, endpoint, or script. Rather than re-derive them from `process.env` or hand-maintain a lookup, ask the plugin. These accessors read the config it stashed on `payload.config.custom`, with global config and per-collection overrides already applied.

```ts
import {
  getBunnyStreamForCollection,
  getBunnyStorageForCollection,
  getBunnyCollectionConfig,
  getBunnyConfig,
} from '@seshuk/payload-storage-bunny'

// inside a hook / endpoint
const stream = getBunnyStreamForCollection(req.payload, 'media')
// → { apiKey, libraryId, hostname, tokenSecurityKey? } | undefined
```

| Accessor                                      | Returns                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| `getBunnyStorageForCollection(payload, slug)` | `{ apiKey, zoneName, hostname, region?, s3?, tokenSecurityKey? }` or `undefined`. |
| `getBunnyStreamForCollection(payload, slug)`  | `{ apiKey, libraryId, hostname, tokenSecurityKey? }` or `undefined`.              |
| `getBunnyCollectionConfig(payload, slug)`     | `{ storage?, stream? }` for a managed collection, or `undefined`.                 |
| `getBunnyConfig(payload)`                     | The full normalized plugin config (escape hatch), or `undefined`.                 |

Semantics:

- **`payload`** is a running Payload instance — `req.payload` in a hook or endpoint, or the instance from `getPayload(...)` in a script.
- **Never throws.** Each accessor returns `undefined` when the plugin is absent or disabled, the slug is not one of the plugin's `collections`, or (for a per-backend accessor) that backend is off for the collection. `getBunnyCollectionConfig` returns an object for any managed slug — a backend the collection does not use is simply absent from it.
- **`getBunnyConfig` is an escape hatch.** It returns the plugin's internal normalized shape, which may change between minor releases. Treat it as read-only and prefer the curated accessors above.
- The curated results are fresh copies; mutating them does not affect the plugin.

:::warning Server-side only
The returned objects contain your Bunny API keys. Use them in server code — hooks, endpoints, scripts — and never send them to the client.
:::
