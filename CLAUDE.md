# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Payload CMS 3.x plugin for Bunny.net storage. Wraps `@payloadcms/plugin-cloud-storage` and provides:

- **Bunny Storage** - Files (images, documents)
- **Bunny Stream** - Videos with HLS/MP4, TUS resumable uploads
- **Per-collection config overrides** - Each collection can customize settings
- **CDN cache purging** - Auto-invalidate on upload/delete
- **Signed URLs** - Secure time-limited access

## Development Commands

```bash
# ALWAYS run before commit
pnpm typecheck

# Build
pnpm build              # Full build (clean + types + compile)
pnpm clean              # Remove dist/

# Code quality
pnpm lint               # ESLint
pnpm lint:fix           # Auto-fix
pnpm format             # Prettier format
pnpm format:check       # Check formatting

# Dev server (test app in dev/)
pnpm dev                # Next.js + Turbo
pnpm dev:safe           # Clean .next first
```

## Architecture

### Data Flow

```
User Config → Normalizer → Collection Context → Handlers → Bunny API
```

1. **User config** (`BunnyStorageConfig`) - What user provides in `payload.config.ts`
2. **Normalizer** (`normalizer.ts`) - Fills defaults, validates, converts to `NormalizedBunnyStorageConfig`
3. **Collection context** (`context.ts`) - Per-collection runtime config (merges global + collection overrides)
4. **Handlers** - Use context (never global config directly)
5. **Bunny API** - Storage or Stream endpoints

### Critical Rule: Always Use Collection Context

❌ **NEVER** use global config directly:

```typescript
// WRONG - uses global config
const timeout = config.storage.uploadTimeout
```

✅ **ALWAYS** use collection context:

```typescript
// CORRECT - uses collection-specific config (with overrides applied)
const timeout = context.storageConfig.uploadTimeout
```

### Config Override System

Collections inherit global config but can override:

- `purge` (false to disable)
- `storage.uploadTimeout`
- `stream.uploadTimeout`
- `stream.mp4Fallback`
- `stream.tus.uploadTimeout`
- `stream.thumbnailTime`
- `signedUrls`
- `thumbnail`
- `urlTransform`

**How overrides work:**

```typescript
// Global config
stream: {
  uploadTimeout: 300000
}

// Collection override
collections: {
  largeVideos: {
    stream: {
      uploadTimeout: 600000
    } // This collection gets 10 min
  }
}

// Result: largeVideos uses 600000, other collections use 300000
```

## Key Directories

```
src/
├── types/           # Type definitions
│   ├── config.ts           # BunnyStorageConfig (user-facing)
│   ├── configNormalized.ts # NormalizedBunnyStorageConfig (internal)
│   └── core.ts             # CollectionContext
│
├── utils/config/    # Config processing (critical!)
│   ├── normalizer.ts       # User config → Normalized config
│   ├── context.ts          # Normalized → Collection context (APPLY OVERRIDES HERE)
│   ├── defaults.ts         # Default values
│   └── validator.ts        # Validation
│
├── handlers/        # File operations (use context!)
│   ├── handleUpload.ts     # Upload to Storage/Stream
│   ├── handleDelete.ts     # Delete + purge cache
│   ├── generateURL.ts      # Generate signed/regular URLs
│   └── staticHandler/      # Serve files (when access control enabled)
│
├── utils/client/    # Bunny API calls
│   ├── storage.ts   # Storage API (PUT/DELETE files)
│   ├── stream.ts    # Stream API (create/upload/delete videos)
│   └── purge.ts     # Cache purging API
│
├── endpoints/       # REST endpoints
│   └── stream.ts    # TUS auth endpoint (/api/storage-bunny/stream/tus-auth)
│
├── hooks/           # Payload hooks
│   ├── afterChange.ts      # Cleanup after TUS upload
│   └── beforeValidate.ts   # Validate TUS uploads
│
└── index.ts         # Plugin entry (extends Payload config)
```

## Common Patterns

### 1. Handler Pattern

```typescript
export const getHandleUpload = (context: CollectionContext): HandleUpload => {
  // Extract from context (already has collection overrides applied)
  const { storageConfig, streamConfig, purgeConfig } = context

  return async ({ file, req }) => {
    if (streamConfig?.apiKey && isVideoFile) {
      // Use Bunny Stream for videos
      await uploadStreamVideo({ buffer, streamConfig, videoId })
    } else if (storageConfig) {
      // Use Bunny Storage for other files
      await uploadStorageFile({ buffer, path, storageConfig })
    }
  }
}
```

### 2. Adding Collection Override (Step-by-step)

**Example: Add `stream.quality` override**

```typescript
// 1. types/config.ts - Add to collection config
export type BunnyStorageCollectionConfig = {
  stream?: {
    quality?: number  // NEW
  }
}

// 2. utils/config/context.ts - Apply override
const prepareStreamConfig = (...) => {
  if (collectionConfig.stream?.quality !== undefined) {
    streamConfig.quality = collectionConfig.stream.quality  // NEW
  }
}

// 3. Update README.md - Document new option
```

### 3. `false` Handling (Critical!)

Some config options can be explicitly disabled with `false`:

```typescript
// ✅ CORRECT - explicit check
purgeConfig: collectionConfig.purge === false ? undefined : collectionConfig.purge

// ❌ WRONG - treats all falsy as disabled
purgeConfig: collectionConfig.purge || undefined
```

**Which properties need this:**

- `purge`, `signedUrls`, `thumbnail`, `urlTransform` (all have type `false | Config`)

## Plugin Entry Point (`index.ts`)

The plugin wraps `@payloadcms/plugin-cloud-storage`:

```typescript
export const bunnyStorage = (pluginConfig) => (incomingConfig) => {
  // 1. Normalize config
  const config = createNormalizedConfig(pluginConfig)

  // 2. Create adapter (handlers factory)
  const adapter = bunnyStorageInternal(config)

  // 3. Extend Payload config
  const finalConfig = {
    ...incomingConfig,
    collections: [
      /* add hooks */
    ],
    endpoints: [
      /* TUS auth */
    ],
    tasks: [
      /* cleanup */
    ],
  }

  // 4. Pass to @payloadcms/plugin-cloud-storage
  return cloudStoragePlugin({ collections: collectionsWithAdapter })(finalConfig)
}
```

## Important Implementation Details

### TUS Uploads

- Client uploads directly to Bunny via TUS protocol
- Auth endpoint (`/api/storage-bunny/stream/tus-auth`) creates video + returns signed URL
- Uses `collectionStreamConfig.tus.uploadTimeout` (collection context, not global!)
- Session tracking via `StreamUploadSessions` collection

### Video Routing

```typescript
if (streamConfig?.apiKey && isStream(mimeType)) {
  // Bunny Stream (HLS/MP4)
} else if (storageConfig) {
  // Bunny Storage (regular file)
}
```

## Pre-Commit Checklist

1. ✅ `pnpm typecheck` passes
2. ✅ Use `context.storageConfig`, not `config.storage`
3. ✅ Use `=== false` for `purge`, `signedUrls`, `thumbnail`, `urlTransform`
4. ✅ Update README.md if adding features
5. ✅ Commit message: compact, one-line, no copyright/co-authored (e.g., `feat: add stream.quality override`)

## Common Mistakes

❌ Using global config:

```typescript
const timeout = config.storage.uploadTimeout // WRONG
```

❌ Wrong false check:

```typescript
purge: collectionConfig.purge || undefined // WRONG
```

✅ Correct:

```typescript
const timeout = context.storageConfig.uploadTimeout
purge: collectionConfig.purge === false ? undefined : collectionConfig.purge
```
