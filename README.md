# Bunny Storage Adapter for Payload CMS

[![GitHub Release](https://img.shields.io/github/v/release/maximseshuk/payload-storage-bunny.svg)](https://github.com/maximseshuk/payload-storage-bunny/releases/) [![Generic badge](https://img.shields.io/badge/npm-blue.svg)](https://www.npmjs.com/package/@seshuk/payload-storage-bunny) [![Generic badge](https://img.shields.io/badge/license-grey.svg)](https://github.com/maximseshuk/payload-storage-bunny/blob/main/LICENSE) [![NPM Downloads](https://img.shields.io/npm/dm/@seshuk/payload-storage-bunny)](https://www.npmjs.com/package/@seshuk/payload-storage-bunny)

Store and serve media files from your Payload CMS using Bunny's CDN.

Built on top of `@payloadcms/plugin-cloud-storage` for easy integration with Payload CMS.

## Table of Contents

- [Features](#features)
- [Performance Recommendation](#-performance-recommendation)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [Collections](#collections-configuration)
  - [Storage](#storage-configuration)
  - [Stream](#stream-configuration)
  - [Cache Purging](#cache-purging-configuration)
  - [Admin Thumbnails](#admin-thumbnail-configuration)
  - [Experimental Features](#experimental-features-configuration)
  - [Access Control](#access-control-configuration)
- [CDN Cache Management](#cdn-cache-management)
- [Getting API Keys](#getting-api-keys)
- [Storage Regions](#storage-regions)
- [Examples](#examples)

## Features

- Upload files to Bunny Storage
- Handle videos with Bunny Stream (HLS, MP4, thumbnails)
- Show thumbnails in your admin panel
- Control access via Payload or direct CDN links
- Automatic CDN cache purging for updated files

## ⚡ Performance Recommendation

> Set `disablePayloadAccessControl: true` for best performance.
>
> This lets users download files directly from Bunny's CDN servers instead of through your Payload server - making content delivery much faster.

## Installation

Requires Payload CMS 3.0.0 or higher.

```bash
# npm
npm install @seshuk/payload-storage-bunny

# yarn
yarn add @seshuk/payload-storage-bunny

# pnpm
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
        media: {
          prefix: 'media',
          disablePayloadAccessControl: true, // Use direct CDN access
        },
      },
      options: {
        storage: {
          apiKey: process.env.BUNNY_STORAGE_API_KEY,
          hostname: 'files.example.b-cdn.net',
          zoneName: 'your-storage-zone',
        },
      },
    }),
  ],
})
```

## Configuration

> **Important**: When you use this plugin, `disableLocalStorage` is automatically set to `true` for each collection. Files won't be stored on your server.

### Collections Configuration

Define which collections will use Bunny Storage:

```typescript
collections: {
  // Simple
  media: true,

  // With options
  [collectionSlug]: {
    // Store files in a specific folder
    prefix: 'media',

    // Control how files are accessed
    disablePayloadAccessControl: true
  }
}
```

The `prefix` option organizes files in folders within your Bunny Storage. For example, `prefix: 'images'` will store uploads in an "images" folder.

### Storage Configuration

Connect to Bunny Storage:

```typescript
storage: {
  // Your Storage API key
  apiKey: string,

  // Your CDN domain (e.g., 'files.example.b-cdn.net')
  hostname: string,

  // Your storage zone name
  zoneName: string,

  // Optional: Region code ('uk', 'ny', etc.)
  region?: string
}
```

> **Important**: Bunny Storage requires a Pull Zone to be configured for your Storage Zone. Files will not be accessible without a properly configured Pull Zone. The `hostname` should be your Pull Zone hostname, not the Storage API endpoint. See [Bunny's documentation](https://support.bunny.net/hc/en-us/articles/8561433879964-How-to-access-and-deliver-files-from-Bunny-Storage) on how to access and deliver files from Bunny Storage.

### Stream Configuration

Optional settings for video handling:

```typescript
stream: {
  // Your Stream API key
  apiKey: string,

  // Stream CDN domain
  hostname: string,

  // Your library ID
  libraryId: string, // like "123456"

  // Enable MP4 downloads (required with access control)
  mp4Fallback: {
    enabled: true
  },

  // Deprecated: Use mp4Fallback instead
  mp4FallbackQuality?: '240p' | '360p' | '480p' | '720p',

  // When to take the thumbnail (milliseconds)
  thumbnailTime?: number
}
```

> **Note**: If you use Payload's access control, you must enable MP4 fallback both here and in your [Bunny Stream settings](https://support.bunny.net/hc/en-us/articles/5154991563026-How-to-retrieve-an-MP4-URL-from-Stream).

**Important**: Video support is always available, even without Bunny Stream configured. If Bunny Stream is disabled, video files will simply be uploaded to Bunny Storage like any other file type. Bunny Stream just provides enhanced video features (streaming, adaptive bitrates, thumbnails).

### Cache Purging Configuration

Enable automatic CDN cache purging for storage files (not applicable to Stream):

```typescript
purge: {
  // Enable cache purging
  enabled: true,

  // Your Bunny API key
  apiKey: string,

  // Optional: wait for purge to complete (default: false)
  async?: boolean
}
```

When enabled, the plugin will automatically purge the CDN cache after:

- File uploads
- File deletions

This ensures that visitors always see the most up-to-date version of your files, which is especially important when replacing existing files (e.g., during image cropping operations).

### Admin Thumbnail Configuration

Control thumbnails in your admin panel:

```typescript
adminThumbnail: true // Default
// or
adminThumbnail: {
  // Add timestamp to bust cache
  appendTimestamp: boolean,

  // Custom image parameters (works with Bunny Optimizer)
  queryParams: {
    width: '300',
    height: '300',
    quality: '90'
  }
}
```

When `appendTimestamp` is enabled (or using the default setting), the plugin automatically adds a timestamp parameter to image URLs in the admin panel. This ensures that when files are updated, the admin UI always shows the latest version without browser caching issues.

The `queryParams` option is particularly useful when used with Bunny's Image Optimizer service, allowing you to resize, crop, and optimize images on-the-fly.

### Experimental Features Configuration

Experimental features that may change or be removed in future versions:

```typescript
experimental: {
  // Fix for Payload CMS unnecessary file re-downloads during field updates
  replaceSaveButtonComponent: true
}
```

Available experimental options:

#### `replaceSaveButtonComponent`

Fixes a Payload CMS issue where updating collection fields (like `alt` text) causes unnecessary file re-downloads and overwrites. When enabled, the plugin replaces the save button component to prevent files from being physically rewritten when only collection fields are being modified.

> **Note**: This is a temporary workaround for [Payload CMS issue #13182](https://github.com/payloadcms/payload/issues/13182). It will be removed when the upstream issue is resolved.

Example with experimental features:

```typescript
bunnyStorage({
  collections: {
    media: true,
  },
  options: {
    storage: {
      apiKey: process.env.BUNNY_STORAGE_API_KEY,
      hostname: 'files.example.b-cdn.net',
      zoneName: 'my-zone',
    },
  },
  experimental: {
    replaceSaveButtonComponent: true,
  },
})
```

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
- Videos need MP4 fallback enabled
- MP4s are served instead of HLS
- Good for files that need protection

When `disablePayloadAccessControl: true`:

- Files go directly from Bunny CDN
- No access rules
- Videos use HLS streams (`playlist.m3u8`)
- Faster delivery but open access
- No need for MP4 fallback

## CDN Cache Management

There are two approaches to managing the CDN cache for your Bunny Storage files:

### Option 1: Automatic Cache Purging

You can enable automatic cache purging whenever files are uploaded or deleted:

```typescript
purge: {
  enabled: true,
  apiKey: process.env.BUNNY_API_KEY,
  async: false // Wait for purge to complete (default: false)
}
```

This is the most comprehensive approach as it ensures the CDN cache is immediately purged when files change, making the updated content available to all visitors.

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

This approach only affects how images are displayed in the admin panel and doesn't purge the actual CDN cache. It appends a timestamp parameter (`?t=1234567890`) to image URLs, causing Bunny CDN to treat each timestamped URL as a unique cache entry.

Choose the approach that best fits your needs:

- Use **automatic cache purging** for immediate updates everywhere
- Use **timestamp-based cache busting** for a simpler setup that only affects the admin panel

## Getting API Keys

### Bunny Storage API Key

To find your Bunny Storage API key:

1. Go to your Bunny Storage dashboard
2. Click on your Storage Zone
3. Go to "FTP & API Access" section
4. Use the "Password" field as your API key (**important**: you must use the full Password, not the Read-only password as it won't work for uploads)
5. Your "Username" is your storage zone name (use this for the `zoneName` parameter)
6. The "Hostname" value can help determine your `region` (e.g., if it shows `ny.storage.bunnycdn.com`, your region is `ny`)

Remember that the `hostname` parameter in the plugin configuration should come from your Pull Zone, not from this section.

### Bunny Stream API Key

To find your Bunny Stream API key:

1. Go to your Bunny Stream dashboard
2. Select your library
3. Click on "API" in the sidebar
4. Find "Video Library ID" for your `libraryId` setting (like "123456")
5. Find "CDN Hostname" for your `hostname` setting (like "vz-example-123.b-cdn.net")
6. The "API Key" is found at the bottom of the page

### Bunny API Key

To find your Bunny API key (used for cache purging):

1. Go to your Bunny.net dashboard
2. Click on your account in the top-right corner
3. Select "Account settings" from the dropdown menu
4. Click on "API" in the sidebar menu
5. Copy the API key displayed on the page

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
  hostname: 'assets.example.b-cdn.net',
  region: 'ny',  // Just 'ny', not 'ny.storage.bunnycdn.com'
  zoneName: 'my-zone'
}
```

## Examples

### Basic Setup with Direct CDN Access

```typescript
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
})
```

### With Cache Purging Enabled

```typescript
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
    purge: {
      enabled: true,
      apiKey: process.env.BUNNY_API_KEY,
      async: false, // Wait for purge to complete
    },
  },
})
```

### With Bunny Stream & Direct CDN Access

```typescript
bunnyStorage({
  collections: {
    media: {
      prefix: 'uploads',
      disablePayloadAccessControl: true,
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
      libraryId: '123456',
      thumbnailTime: 5000, // 5 seconds in milliseconds
    },
    purge: {
      enabled: true,
      apiKey: process.env.BUNNY_API_KEY,
    },
  },
})
```

### With Bunny Stream & Payload Access Control

```typescript
bunnyStorage({
  collections: {
    media: {
      prefix: 'uploads',
      // Not setting disablePayloadAccessControl uses Payload's access control
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
      libraryId: '123456',
      mp4Fallback: { enabled: true }, // Required with access control
      thumbnailTime: 5000, // 5 seconds in milliseconds
    },
    purge: {
      enabled: true,
      apiKey: process.env.BUNNY_API_KEY,
    },
  },
})
```
