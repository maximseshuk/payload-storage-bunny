# Bunny Storage Adapter for Payload CMS

[![GitHub Release](https://img.shields.io/github/v/release/maximseshuk/payload-storage-bunny.svg)](https://github.com/maximseshuk/payload-storage-bunny/releases/) [![Generic badge](https://img.shields.io/badge/npm-blue.svg)](https://www.npmjs.com/package/@seshuk/payload-storage-bunny) [![Generic badge](https://img.shields.io/badge/license-grey.svg)](https://github.com/maximseshuk/payload-storage-bunny/blob/main/LICENSE) [![NPM Downloads](https://img.shields.io/npm/dm/@seshuk/payload-storage-bunny)](https://www.npmjs.com/package/@seshuk/payload-storage-bunny)

Store and serve media files from your Payload CMS using Bunny's fast global CDN.

Built on top of `@payloadcms/plugin-cloud-storage` for seamless Payload CMS integration.

## Table of Contents

- [Features](#features)
- [Performance Tip](#-performance-tip)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [Collections](#collections-configuration)
  - [Storage](#storage-configuration)
  - [Stream](#stream-configuration)
  - [Cache Purging](#cache-purging-configuration)
  - [Admin Thumbnails](#admin-thumbnail-configuration)
  - [Signed URLs](#signed-urls-configuration)
  - [URL Transform](#url-transform-configuration)
  - [TUS Uploads](#tus-uploads-configuration)
  - [Access Control](#access-control-configuration)
- [CDN Cache Management](#cdn-cache-management)
- [Getting API Keys](#getting-api-keys)
- [Storage Regions](#storage-regions)
- [Basic Usage Example](#basic-usage-example)
- [Examples](docs/examples.md)

## Features

- Upload files to Bunny Storage
- Handle videos with Bunny Stream (HLS, MP4, thumbnails)
- TUS resumable uploads for large video files
- Show thumbnails in admin panel
- Signed URLs for secure file access
- Custom URL transformations
- Control file access with Payload rules or direct CDN links
- Automatic CDN cache purging when files change

## ⚡ Performance Tip

> Set `disablePayloadAccessControl: true` for best performance.
>
> This lets users download files directly from Bunny's CDN servers instead of through your Payload server, making content delivery much faster.

## Installation

Requires Payload CMS 3.53.0 or higher.

> **Migration from v1.x**: Version 2.0.0+ requires Payload CMS 3.53.0+. For older Payload versions (3.0.0 - 3.52.x), use version 1.x with the optional experimental `replaceSaveButtonComponent` feature to fix the field update bug. See [Migration Guide](docs/migration-guide.md) for detailed upgrade instructions.

```bash
# npm
npm install @seshuk/payload-storage-bunny

# yarn
yarn add @seshuk/payload-storage-bunny

# pnpm
pnpm add @seshuk/payload-storage-bunny
```

## Quick Start

### 1. Set up environment variables

Create a `.env` file in your project root:

```env
BUNNY_STORAGE_API_KEY=your-storage-api-key
BUNNY_HOSTNAME=example.b-cdn.net
BUNNY_ZONE_NAME=your-storage-zone
```

### 2. Configure the plugin

Add the plugin to your Payload config:

```typescript
import { buildConfig } from 'payload'
import { bunnyStorage } from '@seshuk/payload-storage-bunny'

export default buildConfig({
  plugins: [
    bunnyStorage({
      collections: {
        media: {
          prefix: 'media',
          disablePayloadAccessControl: true, // Use direct CDN access
        },
      },
      storage: {
        apiKey: process.env.BUNNY_STORAGE_API_KEY,
        hostname: process.env.BUNNY_HOSTNAME,
        zoneName: process.env.BUNNY_ZONE_NAME,
      },
    }),
  ],
})
```

### 3. Create your upload collection

Define a collection that uses the plugin:

```typescript
import { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    disableLocalStorage: true, // Required - handled by Bunny.net
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
    },
  ],
}
```

## Configuration

> **Important**: When you use this plugin, `disableLocalStorage` is automatically set to `true` for each collection. Files won't be stored on your server.
>
> **Plugin Control**: Use `enabled: false` to disable the plugin entirely. When disabled, collections will fall back to Payload's default storage behavior.

Main plugin configuration options:

| Option           | Type                | Required | Description                                  |
| ---------------- | ------------------- | -------- | -------------------------------------------- |
| `enabled`        | `boolean`           | ❌       | Enable or disable the plugin (default: true) |
| `collections`    | `object`            | ✅       | Which collections should use Bunny Storage   |
| `storage`        | `object`            | ✅       | Bunny Storage configuration                  |
| `stream`         | `object`            | ❌       | Bunny Stream configuration (optional)        |
| `purge`          | `object`            | ❌       | CDN cache purging configuration (optional)   |
| `adminThumbnail` | `boolean \| object` | ❌       | Global admin thumbnail settings (optional)   |
| `signedUrls`     | `boolean \| object` | ❌       | Global signed URLs configuration (optional)  |
| `urlTransform`   | `object`            | ❌       | Global URL transformation config (optional)  |
| `i18n`           | `object`            | ❌       | Internationalization settings (optional)     |
| `experimental`   | `object`            | ❌       | Experimental features (optional)             |

### Collections Configuration

Define which collections will use Bunny Storage:

| Option                        | Type                | Default         | Description                                                |
| ----------------------------- | ------------------- | --------------- | ---------------------------------------------------------- |
| `[collectionSlug]`            | `boolean \| object` | -               | Enable Bunny Storage for collection (true) or with options |
| `prefix`                      | `string`            | Collection slug | Folder prefix within Bunny Storage                         |
| `disablePayloadAccessControl` | `boolean`           | `false`         | Use direct CDN access (bypasses Payload auth)              |
| `adminThumbnail`              | `boolean \| object` | Global setting  | Override global admin thumbnail config                     |
| `signedUrls`                  | `boolean \| object` | Global setting  | Override global signed URLs config                         |
| `urlTransform`                | `object`            | Global setting  | Override global URL transform config                       |
| `stream.thumbnailTime`        | `number`            | Global setting  | Override default thumbnail time for videos                 |

**Simple usage:**

```typescript
collections: {
  media: true, // Enable with defaults
  videos: { prefix: 'video-uploads', disablePayloadAccessControl: true }
}
```

The `prefix` option organizes files in folders within your Bunny Storage. For example, `prefix: 'images'` stores uploads in an "images" folder.

### Storage Configuration

Connect to Bunny Storage:

| Option             | Type     | Required | Description                                                           |
| ------------------ | -------- | -------- | --------------------------------------------------------------------- |
| `apiKey`           | `string` | ✅       | Your Bunny Storage API key                                            |
| `hostname`         | `string` | ✅       | Your CDN domain from Pull Zone (e.g., 'example.b-cdn.net')            |
| `zoneName`         | `string` | ✅       | Your storage zone name                                                |
| `region`           | `string` | ❌       | Storage region code ('uk', 'ny', 'la', 'sg', 'se', 'br', 'jh', 'syd') |
| `tokenSecurityKey` | `string` | ❌       | Security key for signing storage URLs                                 |
| `uploadTimeout`    | `number` | ❌       | Upload timeout in milliseconds (default: 120000)                      |

> **Important**: Bunny Storage requires a Pull Zone to be configured for your Storage Zone. Files will not be accessible without a properly configured Pull Zone. The `hostname` should be your Pull Zone hostname, not the Storage API endpoint. See [Bunny's documentation](https://support.bunny.net/hc/en-us/articles/8561433879964-How-to-access-and-deliver-files-from-Bunny-Storage?ref=fndfoymy0j) on accessing and delivering files from Bunny Storage.

### Stream Configuration

Optional settings for video handling:

| Option             | Type                | Required | Description                                                                                |
| ------------------ | ------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `apiKey`           | `string`            | ✅       | Your Bunny Stream API key                                                                  |
| `hostname`         | `string`            | ✅       | Stream CDN domain (e.g., 'vz-abc123def-456.b-cdn.net')                                     |
| `libraryId`        | `number`            | ✅       | Your video library ID (e.g., 123456)                                                       |
| `mp4Fallback`      | `boolean`           | ❌       | Enable MP4 downloads (required with access control unless using signed URLs with redirect) |
| `thumbnailTime`    | `number`            | ❌       | Default thumbnail time in milliseconds                                                     |
| `tokenSecurityKey` | `string`            | ❌       | Security key for signing stream URLs                                                       |
| `uploadTimeout`    | `number`            | ❌       | Upload timeout in milliseconds (default: 300000)                                           |
| `tus`              | `boolean \| object` | ❌       | Enable TUS resumable uploads (see TUS config below)                                        |
| `cleanup`          | `boolean \| object` | ❌       | Automatic cleanup of incomplete uploads (requires Jobs Queue setup)                        |

#### TUS Upload Configuration

| Option          | Type       | Default           | Description                              |
| --------------- | ---------- | ----------------- | ---------------------------------------- |
| `autoMode`      | `boolean`  | `true`            | Auto-enable TUS for supported MIME types |
| `checkAccess`   | `function` | Built-in check    | Custom authorization function            |
| `mimeTypes`     | `string[]` | Video/audio types | Supported MIME types for TUS uploads     |
| `uploadTimeout` | `number`   | `3600`            | Upload timeout in seconds                |

#### Cleanup Configuration

| Option     | Type     | Default                                         | Description                                                        |
| ---------- | -------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| `maxAge`   | `number` | `86400`                                         | Time in seconds after which incomplete uploads are considered dead |
| `schedule` | `object` | `{ cron: '0 2 * * *', queue: 'storage-bunny' }` | Cron schedule for cleanup task                                     |

> **Note**: Cleanup feature requires Jobs Queue to be configured in your Payload setup. See [Payload Jobs Queue documentation](https://payloadcms.com/docs/jobs-queue/overview) for setup instructions.

> **Note**: If you use Payload's access control without signed URLs, you must enable MP4 fallback both here and in your [Bunny Stream settings](https://support.bunny.net/hc/en-us/articles/5154991563026-How-to-retrieve-an-MP4-URL-from-Stream?ref=fndfoymy0j). However, if you use signed URLs with `staticHandler.useRedirect: true`, MP4 fallback is not required as users are redirected directly to Bunny's HLS streams.

> **Important**: Video support works even without Bunny Stream configured. If Bunny Stream is disabled, video files upload to Bunny Storage like any other file. Bunny Stream adds enhanced video features (streaming, adaptive bitrates, thumbnails).

### Cache Purging Configuration

Enable automatic CDN cache purging for storage files (not applicable to Stream):

| Option   | Type      | Required | Description                                 |
| -------- | --------- | -------- | ------------------------------------------- |
| `apiKey` | `string`  | ✅       | Your Bunny API key for purging operations   |
| `async`  | `boolean` | ❌       | Wait for purge to complete (default: false) |

When enabled, the plugin automatically purges CDN cache after:

- File uploads
- File deletions

This ensures visitors always see the most up-to-date files, especially important when replacing existing files (like during image cropping).

### Admin Thumbnail Configuration

Control thumbnails in admin panel. Use `adminThumbnail: true` to enable with defaults, `adminThumbnail: false` to disable, or provide an object to customize:

| Option            | Type      | Default | Description                                                               |
| ----------------- | --------- | ------- | ------------------------------------------------------------------------- |
| `appendTimestamp` | `boolean` | `false` | Add timestamp to bust cache                                               |
| `queryParams`     | `object`  | `{}`    | Custom query parameters appended to URLs (optimized for Bunny Optimizer)  |
| `sizeName`        | `string`  | -       | Use specific size from upload collection's sizes instead of original file |

**Example queryParams:**

```typescript
queryParams: {
  width: '300',
  height: '300',
  quality: '90'
}
```

When `appendTimestamp` is enabled, the plugin automatically adds a timestamp parameter to image URLs in the admin panel. This ensures updated files show the latest version without browser caching issues. Additionally, when `appendTimestamp` is enabled, Payload's cache tags are automatically disabled for admin thumbnails to prevent caching conflicts.

The `queryParams` option adds custom query parameters to URLs. It works great with Bunny's Image Optimizer service for resizing, cropping, and optimizing images on-the-fly, but you can add any query parameters you need.

**Example using sizeName with upload collection sizes:**

```typescript
adminThumbnail: {
  sizeName: 'thumbnail', // Uses 'thumbnail' size from collection's sizes config
  appendTimestamp: true  // Can be combined with other options
}
```

The `sizeName` option allows you to use a specific size variant from your upload collection's sizes configuration instead of the original file for admin thumbnails. This works only with image uploads that have sizes configured in your Payload collection. If the specified size doesn't exist in the document, it falls back to the original file.

### Signed URLs Configuration

Enable signed URLs for secure file access:

| Option               | Type       | Default     | Description                                          |
| -------------------- | ---------- | ----------- | ---------------------------------------------------- |
| `expiresIn`          | `number`   | `7200`      | Link expiration time in seconds                      |
| `allowedCountries`   | `string[]` | `[]`        | Allowed countries (ISO 3166-1 alpha-2 codes)         |
| `blockedCountries`   | `string[]` | `[]`        | Blocked countries (ISO 3166-1 alpha-2 codes)         |
| `shouldUseSignedUrl` | `function` | Always sign | Custom function to determine when to use signed URLs |
| `staticHandler`      | `object`   | `{}`        | Static handler behavior (see below)                  |

#### Static Handler Configuration

When Payload access control is enabled, files can be served in two ways:

1. **Proxying** (default): Payload downloads the file from Bunny and serves it to the user
2. **Redirect**: Payload generates a signed URL and redirects the user to download directly from Bunny

**Redirect is recommended** as it reduces server load and improves performance by avoiding file proxying.

| Option           | Type      | Default               | Description                                                               |
| ---------------- | --------- | --------------------- | ------------------------------------------------------------------------- |
| `useRedirect`    | `boolean` | `false`               | Redirect instead of proxying content (recommended for better performance) |
| `redirectStatus` | `number`  | `302`                 | HTTP status code for redirects (301, 302, 307, 308)                       |
| `expiresIn`      | `number`  | Uses main `expiresIn` | Override expiration time for redirects                                    |

Signed URLs work with both Storage and Stream when `tokenSecurityKey` is configured.

### URL Transform Configuration

Custom URL transformations for complete control over file URLs:

#### Simple Transform Options

| Option            | Type      | Default | Description                              |
| ----------------- | --------- | ------- | ---------------------------------------- |
| `appendTimestamp` | `boolean` | `false` | Add timestamp parameter to URLs          |
| `queryParams`     | `object`  | `{}`    | Static query parameters appended to URLs |

#### Advanced Transform Function

| Option         | Type       | Description                              |
| -------------- | ---------- | ---------------------------------------- |
| `transformUrl` | `function` | Custom function for complete URL control |

**Transform function signature:**

```typescript
;(args: {
  baseUrl: string
  collection: CollectionConfig
  data?: Record<string, unknown>
  filename: string
  prefix?: string
}) => string
```

> **Note**: URL transforms don't work when `disablePayloadAccessControl` is true for the collection.

### TUS Uploads Configuration

TUS (resumable uploads) enables reliable uploads of large video files by breaking them into chunks and allowing resume if the connection is interrupted.

**Why use TUS uploads?**

- **Large files**: Essential for video files over 100MB
- **Unreliable connections**: Automatically resumes interrupted uploads
- **Serverless environments**: Perfect for platforms like Vercel with request timeout and file size limits
- **Better UX**: Users don't lose progress if something goes wrong

**Upload Modes:**

- **Auto mode** (`autoMode: true`): TUS is automatically enabled for supported video/audio files
- **Manual mode** (`autoMode: false`): Admin UI shows a toggle button to switch between standard and TUS uploads

**Simple enable:** `tus: true` (uses auto mode by default)

**Detailed configuration:** See [TUS Upload Configuration table](#tus-upload-configuration) in Stream Configuration section above.

> **Important**: The TUS `mimeTypes` setting works together with your collection's `mimeTypes` setting. If a file type is allowed in TUS config but blocked in your collection config, the collection setting takes priority and the file will be rejected.

### Access Control Configuration

```typescript
collections: {
  media: {
    // Optional folder prefix
    prefix: 'media',

    // How files are accessed
    disablePayloadAccessControl: true
  }
}
```

If `disablePayloadAccessControl` is not `true`:

- Files go through Payload's API
- Your access rules work
- Videos need MP4 fallback enabled OR signed URLs with redirect
- MP4s are served instead of HLS (unless using signed URLs with redirect)
- Good for files that need protection

> **Performance tip**: Use signed URLs with redirect to serve HLS streams directly and reduce server load

When `disablePayloadAccessControl: true`:

- Files go directly from Bunny CDN
- No access rules
- Videos use HLS streams (`playlist.m3u8`)
- Faster delivery but open access
- No need for MP4 fallback

## CDN Cache Management

There are two approaches to managing CDN cache for your Bunny Storage files:

### Option 1: Automatic Cache Purging

Enable automatic cache purging when files are uploaded or deleted:

```typescript
purge: {
  apiKey: process.env.BUNNY_API_KEY,
  async: false // Wait for purge to complete (default: false)
}
```

This is the most comprehensive approach as it ensures CDN cache is immediately purged when files change, making updated content available to all visitors.

### Option 2: Timestamp-Based Cache Busting

For the admin panel specifically, you can use timestamp-based cache busting:

1. First, configure the plugin to add timestamps to image URLs:

```typescript
adminThumbnail: {
  appendTimestamp: true
}
```

2. In your Bunny Pull Zone settings:
   - Go to the "Caching" section
   - Enable "Vary Cache" for "URL Query String"
   - Add "t" to the "Query String Vary Parameters" list

This approach only affects how images display in the admin panel and doesn't purge the actual CDN cache. It appends a timestamp parameter (`?t=1234567890`) to image URLs, causing Bunny CDN to treat each timestamped URL as a unique cache entry.

Choose the approach that best fits your needs:

- Use **automatic cache purging** for immediate updates everywhere
- Use **timestamp-based cache busting** for a simpler setup that only affects the admin panel

## Getting API Keys

> **New to Bunny.net?** [Sign up here](https://bunny.net?ref=fndfoymy0j) to get started with fast global CDN and streaming services.

### Bunny Storage API Key

To get your Bunny Storage API key:

1. Go to your **Bunny Storage** dashboard
2. Click on your **Storage Zone**
3. Navigate to **FTP & API Access** section
4. Copy the **Password** field as your API key
   > **Important**: Use the full Password, not the Read-only password (it won't work for uploads)
5. Note your **Username** (this is your `zoneName` parameter)
6. Note the **Hostname** value to determine your `region` (e.g., `ny.storage.bunnycdn.com` = region `ny`)

> **Note**: The `hostname` parameter in plugin configuration comes from your Pull Zone, not from this section.

### Bunny Stream API Key

To get your Bunny Stream API key:

1. Go to your **Bunny Stream** dashboard
2. Select your **Video Library**
3. Click on **API** in the sidebar
4. Copy the **Video Library ID** (use for `libraryId` setting, e.g., "123456")
5. Copy the **CDN Hostname** (use for `hostname` setting, e.g., "vz-abc123def-456.b-cdn.net")
6. Copy the **API Key** (found at the bottom of the page)

### Bunny API Key

To get your Bunny API key (used for cache purging):

1. Go to your **Bunny.net** dashboard
2. Click on your **account** in the top-right corner
3. Select **Account settings** from the dropdown menu
4. Click on **API** in the sidebar menu
5. Copy the **API key** displayed on the page

### Token Security Keys

Token security keys are used for signed URLs to provide secure access to files.

#### Storage Token Security Key

To get your Storage token security key:

1. Go to your **Bunny.net** dashboard
2. Navigate to **Delivery** → **CDN**
3. Select your **Pull Zone**
4. Click on **Security** in the sidebar
5. Click on **Token Authentication**
6. Enable **Token authentication**
7. Copy the **URL token authentication Key**

#### Stream Token Security Key

To get your Stream token security key:

1. Go to your **Bunny.net** dashboard
2. Navigate to **Delivery** → **Stream**
3. Select your **Video Library**
4. Click on **API** in the sidebar
5. Find **CDN zone management** section
6. Click **Manage** button
7. Click on **Security** in the sidebar
8. Click on **Token Authentication**
9. Enable **Token authentication**
10. Copy the **URL token authentication Key**

## Storage Regions

Choose where to store your files. If you don't pick a region, the default storage location is used.

Use only the region code in the `region` setting:

- Default: leave empty
- `uk` - London, UK
- `ny` - New York, US
- `la` - Los Angeles, US
- `sg` - Singapore
- `se` - Stockholm, SE
- `br` - São Paulo, BR
- `jh` - Johannesburg, SA
- `syd` - Sydney, AU

To determine your region, check your Bunny Storage Zone settings. Pick a region closest to your users for best performance. The region code is found in your Storage Zone's hostname (e.g., if your endpoint is `ny.storage.bunnycdn.com`, use `ny` as the region).

Example:

```typescript
storage: {
  apiKey: process.env.BUNNY_STORAGE_API_KEY,
  hostname: 'example.b-cdn.net',
  region: 'ny',  // Just 'ny', not 'ny.storage.bunnycdn.com'
  zoneName: 'my-zone'
}
```

## Basic Usage Example

```typescript
import { buildConfig } from 'payload'
import { bunnyStorage } from '@seshuk/payload-storage-bunny'

export default buildConfig({
  plugins: [
    bunnyStorage({
      enabled: true, // Enable/disable the plugin (default: true)
      collections: {
        media: {
          prefix: 'media',
          disablePayloadAccessControl: true,
        },
      },
      storage: {
        apiKey: process.env.BUNNY_STORAGE_API_KEY,
        hostname: 'example.b-cdn.net',
        zoneName: 'your-storage-zone',
      },
      // Optional: Enable video streaming
      stream: {
        apiKey: process.env.BUNNY_STREAM_API_KEY,
        hostname: 'vz-abc123def-456.b-cdn.net',
        libraryId: 123456,
        tus: true, // Enable resumable uploads
      },
      // Optional: Auto-purge CDN cache
      purge: {
        apiKey: process.env.BUNNY_API_KEY,
      },
    }),
  ],
})
```

For detailed configuration examples and advanced use cases, see [docs/examples.md](docs/examples.md).

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

Need help? Here are some resources:

- **Documentation**: [Bunny.net Documentation](https://docs.bunny.net/?ref=fndfoymy0j)
- **Bug Reports**: [GitHub Issues](https://github.com/maximseshuk/payload-storage-bunny/issues)
- **Community Support**: [Payload CMS Discord](https://discord.gg/payloadcms)
- **Questions**: Join the discussion in our GitHub Issues or Payload Discord

## Credits

Built with ❤️ for the Payload CMS community.

---

**Disclosure**: Links to bunny.net in this documentation are referral links.
