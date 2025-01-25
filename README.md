# Bunny Storage Adapter for Payload CMS

[![GitHub Release](https://img.shields.io/github/v/release/maximseshuk/payload-storage-bunny.svg)](https://github.com/maximseshuk/payload-storage-bunny/releases/) [![Generic badge](https://img.shields.io/badge/npm-blue.svg)](https://www.npmjs.com/package/@seshuk/payload-storage-bunny) [![Generic badge](https://img.shields.io/badge/license-grey.svg)](https://github.com/maximseshuk/payload-storage-bunny/blob/main/LICENSE) [![NPM Downloads](https://img.shields.io/npm/dm/@seshuk/payload-storage-bunny)](https://www.npmjs.com/package/@seshuk/payload-storage-bunny)

A plugin to use Bunny Storage and Bunny Stream with Payload CMS. Store and serve your media files using Bunny's CDN.

Built on top of `@payloadcms/plugin-cloud-storage` for seamless integration with Payload CMS.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Plugin Options](#plugin-options)
- [Storage Regions](#storage-regions)
- [Video Handling](#video-handling)
  - [With Bunny Stream](#with-bunny-stream)
    - [MP4 Video Access](#mp4-video-access)
    - [Video Thumbnails](#video-thumbnails)
- [Admin Thumbnails](#admin-thumbnails)
- [Examples](#examples)
  - [Basic Media Upload](#basic-media-upload)
  - [With Video Support](#with-video-support)

## Features

- Upload files to Bunny Storage
- Handle videos with optional Bunny Stream integration for advanced features (HLS, thumbnails)
- Show thumbnails in admin panel

## Installation

Requires Payload CMS version 3.0.0 or higher.

```bash
npm install @seshuk/payload-storage-bunny
# or
yarn add @seshuk/payload-storage-bunny
# or
pnpm add @seshuk/payload-storage-bunny
```

## Quick Start

```typescript
import { buildConfig } from 'payload'
import { bunnyStorage } from '@seshuk/payload-storage-bunny'

export default buildConfig({
  plugins: [
    bunnyStorage({
      collections: {
        media: true, // Use for 'media' collection
      },
      options: {
        storage: {
          apiKey: process.env.BUNNY_STORAGE_API_KEY,
          hostname: 'files.example.b-cdn.net', // Your custom domain or Bunny hostname
          zoneName: 'your-storage-zone',
        },
      },
    }),
  ],
})
```

## Plugin Options

> **Note**: When you use this plugin, `disableLocalStorage` will be automatically set to `true` for each collection. This means files won't be stored locally.

```typescript
type BunnyAdapterOptions = {
  /**
   * Admin thumbnail configuration
   * - When set to `true`, uses default behavior
   * - When object provided, allows customizing thumbnail behavior
   */
  adminThumbnail?:
    | {
        /** Append timestamp for cache busting */
        appendTimestamp?: boolean
        /** Custom query parameters (can be used with Bunny Optimizer or for other needs) */
        queryParams?: Record<string, string>
      }
    | boolean

  /**
   * Bunny Storage settings (required)
   */
  storage: {
    /** Your Storage API key */
    apiKey: string
    /** Custom domain or Bunny CDN hostname (e.g., 'files.example.b-cdn.net') */
    hostname: string
    /** Where to store files (optional) */
    region?: 'br' | 'jh' | 'la' | 'ny' | 'se' | 'sg' | 'syd' | 'uk' | string
    /** Your storage zone name */
    zoneName: string
  }

  /**
   * Bunny Stream settings (optional)
   * Add this if you want to handle videos with Bunny Stream
   */
  stream?: {
    /** Your Stream API key */
    apiKey: string
    /** Stream service URL */
    hostname: string
    /** Your library ID */
    libraryId: string
    /** MP4 video quality for direct access */
    mp4FallbackQuality?: '240p' | '360p' | '480p' | '720p'
    /** When to take video thumbnail (in seconds) */
    thumbnailTime?: number
  }
}
```

## Storage Regions

You can choose where to store your files. If you don't pick a region, the default storage endpoint will be used.

When setting the `region` field, use only the region code (like 'uk' or 'ny'), not the full hostname.

Available regions and their codes:

- Default: leave empty or undefined
- `uk` - London, UK
- `ny` - New York, US
- `la` - Los Angeles, US
- `sg` - Singapore
- `se` - Stockholm, SE
- `br` - São Paulo, BR
- `jh` - Johannesburg, SA
- `syd` - Sydney, AU

You can also use a custom region code if needed.

Example:

```typescript
storage: {
  apiKey: process.env.BUNNY_STORAGE_API_KEY,
  hostname: 'assets.example.b-cdn.net',  // Your Bunny CDN hostname
  region: 'ny',  // Just the code: 'ny', not 'ny.storage.bunnycdn.com'
  zoneName: 'my-zone'
}
```

## Video Handling

By default, video files will be uploaded to Bunny Storage just like any other files. However, if you add `stream` settings, videos will be handled by Bunny Stream instead, giving you additional features like adaptive streaming and automatic thumbnails.

### With Bunny Stream

If you add `stream` settings, the plugin will:

#### MP4 Video Access

To use MP4 video files directly:

1. Turn on MP4 support in your Bunny Stream dashboard
2. Set `disablePayloadAccessControl` to `false` in Payload
3. Choose quality in `mp4FallbackQuality`

#### Video Thumbnails

Use `thumbnailTime` to pick when in the video to take the thumbnail (in seconds).

## Admin Thumbnails

The plugin can show thumbnails in your admin panel. This is optional and works differently for each file type:

- Videos: Uses Bunny Stream's automatic thumbnails (thumbnail.jpg)
- Images: You can add timestamps to refresh cached images and add any query parameters you need. While this is particularly useful with Bunny Optimizer (for image resizing), you can use any query parameters that suit your needs.

Example setup:

```typescript
bunnyStorage({
  options: {
    adminThumbnail: {
      appendTimestamp: true, // Add time to refresh thumbnails
      queryParams: {
        // You can use Bunny Optimizer parameters
        width: '300',
        height: '300',
        // Or any other query parameters you need
        quality: '90',
        custom: 'value',
      },
    },
    // ... other settings
  },
})
```

## Examples

### Basic Media Upload

```typescript
import { buildConfig } from 'payload'
import { bunnyStorage } from '@seshuk/payload-storage-bunny'

export default buildConfig({
  plugins: [
    bunnyStorage({
      collections: {
        media: true,
      },
      options: {
        storage: {
          apiKey: process.env.BUNNY_STORAGE_API_KEY,
          hostname: 'storage.example.b-cdn.net',
          zoneName: 'my-zone',
        },
      },
    }),
  ],
})
```

### With Video Support

```typescript
import { buildConfig } from 'payload'
import { bunnyStorage } from '@seshuk/payload-storage-bunny'

export default buildConfig({
  plugins: [
    bunnyStorage({
      collections: {
        media: {
          prefix: 'media',
        },
      },
      options: {
        storage: {
          apiKey: process.env.BUNNY_STORAGE_API_KEY,
          hostname: 'storage.example.b-cdn.net',
          region: 'ny',
          zoneName: 'my-zone',
        },
        stream: {
          apiKey: process.env.BUNNY_STREAM_API_KEY,
          hostname: 'stream.example.b-cdn.net',
          libraryId: 'lib-123',
          mp4FallbackQuality: '720p',
        },
      },
    }),
  ],
})
```
