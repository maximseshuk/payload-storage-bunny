# Configuration Examples

This document provides detailed configuration examples for different use cases of the Bunny Storage plugin for Payload CMS.

## Table of Contents

- [Basic Setup](#basic-setup)
- [With Cache Purging](#with-cache-purging)
- [Video Streaming (Direct CDN)](#video-streaming-direct-cdn)
- [Video Streaming (With Access Control)](#video-streaming-with-access-control)
- [Signed URLs for Security](#signed-urls-for-security)
- [Custom URL Transforms](#custom-url-transforms)
- [TUS Resumable Uploads](#tus-resumable-uploads)
- [Multiple Collections](#multiple-collections)

## Basic Setup

Simple configuration for file storage with direct CDN access:

```typescript
import { buildConfig } from 'payload'
import { bunnyStorage } from '@seshuk/payload-storage-bunny'

export default buildConfig({
  plugins: [
    bunnyStorage({
      collections: {
        media: true,
      },
      storage: {
        apiKey: process.env.BUNNY_STORAGE_API_KEY,
        hostname: 'storage.example.b-cdn.net',
        zoneName: 'my-zone',
      },
    }),
  ],
})
```

## With Cache Purging

Automatically purge CDN cache when files are uploaded or deleted:

```typescript
bunnyStorage({
  collections: {
    media: true,
  },
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
})
```

## Video Streaming (Direct CDN)

Configuration with Bunny Stream for direct CDN video delivery:

```typescript
bunnyStorage({
  collections: {
    media: {
      prefix: 'uploads',
      disablePayloadAccessControl: true,
    },
  },
  storage: {
    apiKey: process.env.BUNNY_STORAGE_API_KEY,
    hostname: 'storage.example.b-cdn.net',
    region: 'ny',
    zoneName: 'my-zone',
  },
  stream: {
    apiKey: process.env.BUNNY_STREAM_API_KEY,
    hostname: 'stream.example.b-cdn.net',
    libraryId: 123456,
    thumbnailTime: 5000, // 5 seconds in milliseconds
    tus: true, // Enable TUS resumable uploads
  },
  purge: {
    enabled: true,
    apiKey: process.env.BUNNY_API_KEY,
  },
})
```

## Video Streaming (With Access Control)

Configuration with Payload access control and signed URLs:

```typescript
bunnyStorage({
  collections: {
    media: {
      prefix: 'uploads',
      // Not setting disablePayloadAccessControl uses Payload's access control
      signedUrls: {
        expiresIn: 3600, // 1 hour
        allowedCountries: ['US', 'CA', 'GB'],
      },
    },
  },
  storage: {
    apiKey: process.env.BUNNY_STORAGE_API_KEY,
    hostname: 'storage.example.b-cdn.net',
    region: 'ny',
    zoneName: 'my-zone',
    tokenSecurityKey: process.env.BUNNY_TOKEN_SECURITY_KEY,
  },
  stream: {
    apiKey: process.env.BUNNY_STREAM_API_KEY,
    hostname: 'stream.example.b-cdn.net',
    libraryId: 123456,
    mp4Fallback: true, // Required with access control
    thumbnailTime: 5000,
    tokenSecurityKey: process.env.BUNNY_STREAM_TOKEN_SECURITY_KEY,
    tus: {
      autoMode: true,
      uploadTimeout: 3600,
    },
    cleanup: {
      maxAge: 86400, // 24 hours
      schedule: {
        cron: '0 2 * * *', // Daily at 2 AM
        queue: 'storage-bunny',
      },
    },
  },
  purge: {
    enabled: true,
    apiKey: process.env.BUNNY_API_KEY,
  },
})
```

## Signed URLs for Security

Configuration with signed URLs for secure file access:

```typescript
bunnyStorage({
  collections: {
    media: {
      signedUrls: {
        expiresIn: 7200, // 2 hours
        allowedCountries: ['US', 'CA', 'GB', 'AU'],
        shouldUseSignedUrl: ({ collection, filename }) => {
          // Only sign video files
          return filename.match(/\.(mp4|webm|mov|avi)$/i) !== null
        },
        staticHandler: {
          useRedirect: true,
          redirectStatus: 302,
          expiresIn: 1800, // 30 minutes for redirects
        },
      },
    },
  },
  storage: {
    apiKey: process.env.BUNNY_STORAGE_API_KEY,
    hostname: 'storage.example.b-cdn.net',
    zoneName: 'my-zone',
    tokenSecurityKey: process.env.BUNNY_TOKEN_SECURITY_KEY,
  },
  signedUrls: {
    expiresIn: 7200, // Global default
    blockedCountries: ['CN', 'RU'], // Block specific countries
  },
})
```

## Custom URL Transforms

Transform URLs with custom parameters:

```typescript
bunnyStorage({
  collections: {
    media: {
      urlTransform: {
        appendTimestamp: true,
        queryParams: {
          version: '2',
          optimize: 'true',
        },
      },
    },
    avatars: {
      urlTransform: {
        transformUrl: ({ baseUrl, collection, filename }) => {
          // Custom transform for avatars
          const size = filename.includes('large') ? '300' : '150'
          return `${baseUrl}?width=${size}&height=${size}&quality=90`
        },
      },
    },
  },
  storage: {
    apiKey: process.env.BUNNY_STORAGE_API_KEY,
    hostname: 'storage.example.b-cdn.net',
    zoneName: 'my-zone',
  },
  adminThumbnail: {
    appendTimestamp: true,
    queryParams: {
      width: '200',
      height: '200',
      quality: '85',
    },
  },
})
```

## TUS Resumable Uploads

Configuration optimized for large video file uploads:

```typescript
bunnyStorage({
  collections: {
    videos: {
      prefix: 'video-content',
      disablePayloadAccessControl: true,
    },
  },
  storage: {
    apiKey: process.env.BUNNY_STORAGE_API_KEY,
    hostname: 'storage.example.b-cdn.net',
    zoneName: 'my-zone',
    uploadTimeout: 300000, // 5 minutes
  },
  stream: {
    apiKey: process.env.BUNNY_STREAM_API_KEY,
    hostname: 'stream.example.b-cdn.net',
    libraryId: 123456,
    tus: {
      autoMode: true, // Auto-enable for supported video types
      uploadTimeout: 7200, // 2 hours for large files
      mimeTypes: [
        'video/mp4',
        'video/webm',
        'video/x-matroska', // .mkv
        'video/quicktime', // .mov
        'video/x-msvideo', // .avi
      ],
      checkAccess: (req) => {
        // Custom access check
        return req.user?.role === 'admin' || req.user?.role === 'editor'
      },
    },
    cleanup: true, // Enable automatic cleanup with defaults
    uploadTimeout: 600000, // 10 minutes for stream uploads
  },
})
```

## Multiple Collections

Configuration with different settings for multiple collections:

```typescript
bunnyStorage({
  collections: {
    // Public media with direct CDN access
    media: {
      prefix: 'public',
      disablePayloadAccessControl: true,
      adminThumbnail: {
        appendTimestamp: true,
        queryParams: { width: '200', height: '200' },
      },
    },

    // Private documents with access control
    documents: {
      prefix: 'private',
      signedUrls: {
        expiresIn: 1800, // 30 minutes
        staticHandler: {
          useRedirect: false, // Proxy through Payload
        },
      },
    },

    // Videos with streaming
    videos: {
      prefix: 'video-content',
      disablePayloadAccessControl: true,
      stream: {
        thumbnailTime: 3000, // 3 seconds
      },
    },

    // User avatars with optimization
    avatars: {
      prefix: 'avatars',
      urlTransform: {
        queryParams: {
          width: '150',
          height: '150',
          quality: '90',
        },
      },
    },
  },
  storage: {
    apiKey: process.env.BUNNY_STORAGE_API_KEY,
    hostname: 'cdn.example.com',
    region: 'ny',
    zoneName: 'main-storage',
    tokenSecurityKey: process.env.BUNNY_TOKEN_SECURITY_KEY,
  },
  stream: {
    apiKey: process.env.BUNNY_STREAM_API_KEY,
    hostname: 'video.example.com',
    libraryId: 123456,
    mp4Fallback: true,
    tus: true,
    cleanup: {
      maxAge: 172800, // 48 hours
    },
  },
  purge: {
    enabled: true,
    apiKey: process.env.BUNNY_API_KEY,
  },
  adminThumbnail: {
    appendTimestamp: true, // Global default
  },
})
```

## Environment Variables

For all examples above, make sure to set these environment variables:

```env
# Bunny Storage
BUNNY_STORAGE_API_KEY=your-storage-api-key
BUNNY_TOKEN_SECURITY_KEY=your-token-security-key

# Bunny Stream (optional)
BUNNY_STREAM_API_KEY=your-stream-api-key
BUNNY_STREAM_TOKEN_SECURITY_KEY=your-stream-token-security-key

# Bunny API (for cache purging)
BUNNY_API_KEY=your-bunny-api-key
```

See the [Getting API Keys](../README.md#getting-api-keys) section in the main README for instructions on obtaining these keys.
