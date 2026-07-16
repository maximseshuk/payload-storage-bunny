<div align="center">

<picture>
  <img src="docs/docs/public/logo.svg" alt="Bunny.net Storage for Payload" height="80" />
</picture>

<h1>Bunny.net Storage for Payload</h1>

<a href="https://bunny.net?ref=fndfoymy0j"><img src="media/bunny-banner.png" alt="Bunny.net — Fast Global CDN" /></a>

<p>Store files and stream video from Payload CMS on Bunny's fast global CDN.</p>

<a href="https://github.com/maximseshuk/payload-storage-bunny/releases/"><img src="https://img.shields.io/github/v/release/maximseshuk/payload-storage-bunny?style=flat-square&logo=github" alt="GitHub release" /></a>
<a href="https://www.npmjs.com/package/@seshuk/payload-storage-bunny"><img src="https://img.shields.io/npm/v/@seshuk/payload-storage-bunny?style=flat-square&logo=npm" alt="npm version" /></a>
<a href="https://www.npmjs.com/package/@seshuk/payload-storage-bunny"><img src="https://img.shields.io/npm/dm/@seshuk/payload-storage-bunny?style=flat-square&logo=npm" alt="npm downloads" /></a>
<a href="https://github.com/maximseshuk/payload-storage-bunny/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/maximseshuk/payload-storage-bunny/ci.yml?style=flat-square&logo=github" alt="CI" /></a>
<a href="https://payload-storage-bunny.seshuk.im/"><img src="https://img.shields.io/badge/docs-payload--storage--bunny.seshuk.im-blue?style=flat-square&logo=readthedocs&logoColor=white" alt="Documentation" /></a>
<a href="https://github.com/maximseshuk/payload-storage-bunny/blob/main/LICENSE"><img src="https://img.shields.io/github/license/maximseshuk/payload-storage-bunny?style=flat-square" alt="license" /></a>
<a href="https://ko-fi.com/seshuk"><img src="https://img.shields.io/badge/Ko--fi-Buy_me_a_coffee-ff5f5f?style=flat-square&logo=ko-fi&logoColor=white" alt="Ko-fi" /></a>

</div>

## Features

- **Bunny Storage** — upload files, images, and documents to Bunny's global CDN.
- **Bunny Stream** — video with HLS/MP4 streaming, adaptive bitrates, thumbnails, and TUS resumable uploads for large files.
- **Client-direct uploads** — file bytes go straight from the browser to Bunny (presigned S3 or a Bunny Edge Script), bypassing serverless body-size limits.
- **Signed URLs** — time-limited links with country restrictions and per-client IPv4 locking, for both Storage and Stream.
- **CDN cache purging** — auto-invalidate on upload and delete so visitors always see the latest file.
- **Thumbnails** — admin-panel and API previews, with on-the-fly resizing via Bunny Optimizer.
- **Per-collection overrides** — tune any setting per collection, or point a collection at its own zone / library for multi-tenant setups.
- **Setup wizard & CLI** — one command provisions your Bunny resources and prints a ready-to-paste config; a second deploys the client-uploads Edge Script.

## Quick start

Requires **Payload CMS 3.83.0 or later** and **Node.js 22 or later**.

> [!IMPORTANT]
> **Upgrading from v2?** v3 renames/removes several config keys (the plugin throws a clear error at startup) **and requires a one-time data migration** of stored Stream metadata into the new `bunnyData` field. Back up your database and follow the [Upgrade Guide](https://payload-storage-bunny.seshuk.im/upgrade-guide) — skipping the migration leaves existing videos with broken thumbnails and empty metadata.

### Setup wizard (recommended)

One interactive command provisions the Bunny resources you need — storage zone, pull zone, and/or video library — with production defaults, then prints a ready-to-paste `bunnyStorage({ … })` block and the matching `.env` lines. Nothing billable is created without confirmation.

```bash
npx @seshuk/payload-storage-bunny init
```

See the [Setup Wizard](https://payload-storage-bunny.seshuk.im/cli/init) docs. Prefer to wire it up by hand? Follow the [Quick Start](https://payload-storage-bunny.seshuk.im/quick-start).

### Install

```bash
npm install @seshuk/payload-storage-bunny
yarn add @seshuk/payload-storage-bunny
pnpm add @seshuk/payload-storage-bunny
```

### Configure

Add the plugin to your Payload config, pointing it at an upload collection:

```typescript
import { buildConfig } from 'payload'
import { bunnyStorage } from '@seshuk/payload-storage-bunny'

export default buildConfig({
  plugins: [
    bunnyStorage({
      collections: {
        media: {
          prefix: 'media',
          disablePayloadAccessControl: true, // serve directly from Bunny's CDN
        },
      },
      storage: {
        apiKey: process.env.BUNNY_STORAGE_API_KEY,
        hostname: process.env.BUNNY_STORAGE_HOSTNAME, // your Pull Zone host, e.g. example.b-cdn.net
        zoneName: process.env.BUNNY_STORAGE_ZONE_NAME,
      },
    }),
  ],
})
```

Add `stream` for video, `purge` for cache invalidation, `signedUrls` for secure links, and more — see the [configuration reference](https://payload-storage-bunny.seshuk.im/configuration/).

## Documentation

Full docs are at **<https://payload-storage-bunny.seshuk.im/>**:

- [Quick Start](https://payload-storage-bunny.seshuk.im/quick-start)
- [Configuration reference](https://payload-storage-bunny.seshuk.im/configuration/)
- [Collection overrides & multi-tenant](https://payload-storage-bunny.seshuk.im/configuration/collection-overrides)
- [Client uploads](https://payload-storage-bunny.seshuk.im/configuration/storage/client-uploads)
- [Signed URLs](https://payload-storage-bunny.seshuk.im/configuration/signed-urls)
- [CLI — setup wizard & Edge Script deploy](https://payload-storage-bunny.seshuk.im/cli/init)
- [Upgrade Guide](https://payload-storage-bunny.seshuk.im/upgrade-guide)
- [Examples](https://payload-storage-bunny.seshuk.im/examples)

## Related plugins

- **[@seshuk/payload-plugin-media-preview](https://github.com/maximseshuk/payload-plugin-media-preview)** — preview images, video, audio, and documents directly in the Payload admin panel. Works with any storage adapter; ships a [Bunny Stream adapter](https://payload-storage-bunny.seshuk.im/media-preview) for this plugin.
- **[@seshuk/payload-plugin-openapi](https://github.com/maximseshuk/payload-plugin-openapi)** — OpenAPI 3.0/3.1/3.2 spec generator for Payload CMS, with Scalar / Swagger UI.

## Support

Bug reports, feature requests, and questions go to [GitHub Issues](https://github.com/maximseshuk/payload-storage-bunny/issues). For Payload itself, see the [Payload CMS docs](https://payloadcms.com/docs) and [Discord](https://discord.gg/payloadcms).

## License

MIT — see [LICENSE](LICENSE).

## Credits

Built by [Maxim Seshuk](https://github.com/maximseshuk) for the Payload CMS community.

If this plugin saves you time, you can [buy me a coffee](https://ko-fi.com/seshuk) ☕

---

**Disclosure**: links to bunny.net in this README are referral links.
