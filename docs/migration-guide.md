# Migration Guide

This guide covers upgrading between major versions of the Bunny Storage plugin.

## v1.x to v2.x

### Version Requirements

**v2.x needs Payload CMS v3.53.0 or higher**

If you're below v3.53.0:

- Upgrade Payload first, then migrate to v2.x
- Or stay on v1.x: `npm install @seshuk/payload-storage-bunny@^1.0.0`

### What Changed

The main changes in v2.x:

| What             | v1.x                               | v2.x                |
| ---------------- | ---------------------------------- | ------------------- |
| Config structure | `options: { storage: {...} }`      | `storage: {...}`    |
| Library ID       | `libraryId: '123456'`              | `libraryId: 123456` |
| MP4 fallback     | `mp4Fallback: { enabled: true }`   | `mp4Fallback: true` |
| Purge setup      | `purge: { enabled: true, apiKey }` | `purge: { apiKey }` |
| Experimental fix | `replaceSaveButtonComponent: true` | ❌ Not needed       |

### How to Migrate

**Step 1: Update the package**

```bash
npm install @seshuk/payload-storage-bunny@latest
```

**Step 2: Remove the options wrapper**

```typescript
// Before
bunnyStorage({
  collections: {
    /* ... */
  },
  options: {
    // ❌ Remove this
    storage: {
      /* ... */
    },
    stream: {
      /* ... */
    },
    purge: {
      /* ... */
    },
  },
})

// After
bunnyStorage({
  collections: {
    /* ... */
  },
  storage: {
    /* ... */
  }, // ✅ Move to top level
  stream: {
    /* ... */
  },
  purge: {
    /* ... */
  },
})
```

**Step 3: Fix stream config**

```typescript
// Before
stream: {
  libraryId: '123456',           // ❌ String
  mp4Fallback: { enabled: true } // ❌ Object
}

// After
stream: {
  libraryId: 123456,    // ✅ Number
  mp4Fallback: true     // ✅ Boolean
}
```

**Step 4: Fix purge config**

```typescript
// Before
purge: {
  enabled: true,  // ❌ Remove this
  apiKey: '...'
}

// After
purge: {
  apiKey: '...'   // ✅ Presence enables it
}
```

**Step 5: Remove experimental stuff**

```typescript
// Remove this entirely:
experimental: {
  replaceSaveButtonComponent: true
}
```

### Complete Example

**Before (v1.x):**

```typescript
bunnyStorage({
  collections: {
    media: {
      prefix: 'uploads',
      disablePayloadAccessControl: true,
    },
  },
  options: {
    // ❌ Remove wrapper
    storage: {
      apiKey: process.env.BUNNY_STORAGE_API_KEY,
      hostname: 'storage.example.b-cdn.net',
      region: 'ny',
      zoneName: 'my-zone',
    },
    stream: {
      apiKey: process.env.BUNNY_STREAM_API_KEY,
      hostname: 'stream.example.b-cdn.net',
      libraryId: '123456', // ❌ String
      mp4Fallback: { enabled: true }, // ❌ Object
      thumbnailTime: 5000,
    },
    purge: {
      enabled: true, // ❌ Remove
      apiKey: process.env.BUNNY_API_KEY,
    },
  },
  experimental: {
    // ❌ Remove
    replaceSaveButtonComponent: true,
  },
})
```

**After (v2.x):**

```typescript
bunnyStorage({
  collections: {
    media: {
      prefix: 'uploads',
      disablePayloadAccessControl: true,
    },
  },
  storage: {
    // ✅ No wrapper
    apiKey: process.env.BUNNY_STORAGE_API_KEY,
    hostname: 'storage.example.b-cdn.net',
    region: 'ny',
    zoneName: 'my-zone',
  },
  stream: {
    apiKey: process.env.BUNNY_STREAM_API_KEY,
    hostname: 'stream.example.b-cdn.net',
    libraryId: 123456, // ✅ Number
    mp4Fallback: true, // ✅ Boolean
    thumbnailTime: 5000,
    // New features you can add:
    tus: true,
    cleanup: true,
  },
  purge: {
    apiKey: process.env.BUNNY_API_KEY, // ✅ No `enabled`
  },
})
```

### New Features in v2.x

**TUS Resumable Uploads** - Perfect for large video files:

```typescript
stream: {
  tus: true, // Simple setup
  // Or customize:
  tus: {
    autoMode: true, // Auto-enable for video files
    uploadTimeout: 7200
  }
}
```

**Signed URLs** - Secure file access with geo-restrictions:

```typescript
signedUrls: {
  expiresIn: 7200,
  allowedCountries: ['US', 'ID'],
  staticHandler: { useRedirect: true }
}
```

**URL Transform** - Customize file URLs:

```typescript
urlTransform: {
  queryParams: {
    source: 'app'
  }
  // Or custom function:
  // transformUrl: ({ baseUrl, filename }) => `${baseUrl}/${filename}?custom`
}
```

**Admin Thumbnail Control** - Better admin panel thumbnails:

```typescript
adminThumbnail: {
  appendTimestamp: true, // Default in v2.x
  queryParams: { w: '300', h: '300' }
}
```

**Stream Cleanup** - Auto-remove failed uploads:

```typescript
stream: {
  cleanup: true // Runs daily cleanup
}
```

## Need Help?

Check the [`dev/` directory](../dev/) for working examples, or [open an issue](https://github.com/maximseshuk/payload-storage-bunny/issues) if you run into problems.

For Payload CMS upgrade help, see their [official docs](https://payloadcms.com/docs).

---

_This migration guide will be updated for future versions as the plugin evolves._
