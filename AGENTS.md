# Bunny.net Storage for Payload

Payload CMS 3.x storage adapter for Bunny.net. Wraps `@payloadcms/plugin-cloud-storage` and adds:

- **Bunny Storage** — files, images, documents (HTTP API or S3-compatible).
- **Bunny Stream** — video with HLS/MP4, thumbnails, TUS resumable uploads.
- **Client-direct uploads** — browser → Bunny (presigned S3 or an Edge Script).
- **Signed URLs** — time-limited links with country and per-client IPv4 locking.
- **CDN cache purging** — auto-invalidate on upload/delete.
- **Per-collection overrides** — every setting, plus a collection's own zone/library.
- **CLI** — `init` setup wizard and `bunny:deploy-edge-script`.
- **Subpath exports** — `./client` (admin UI), `./media-preview` (Stream adapter), `./migrations` (v2→v3 data migration).

## Environment

- Package manager is **pnpm**. Node.js 22+, Payload CMS 3.83+.
- Install with `pnpm install`.
- Runtime commands that touch Bunny read secrets from `.env` (loaded via `dotenv`); never hardcode keys.

## Commands

```bash
pnpm typecheck        # tsc --noEmit — ALWAYS run before committing
pnpm lint             # oxlint
pnpm lint:fix         # oxlint --fix
pnpm format           # oxfmt (write)
pnpm format:check     # oxfmt --check

pnpm build            # tsdown (bundles dist/)
pnpm clean            # remove dist/ + tsbuildinfo

pnpm test:unit        # vitest, no env — the default fast gate
pnpm test             # vitest with .env
pnpm test:coverage    # vitest + coverage
pnpm test:e2e         # live e2e against real Bunny resources (needs .env)

pnpm dev              # dev/test Payload app (tests/dev.ts)
pnpm docs:dev         # rspress docs site (docs/)
```

Run `pnpm typecheck && pnpm lint && pnpm format` before every commit. Not just typecheck.

## Repository Structure

```
src/
├── index.ts        # Plugin entry — extends Payload config
├── types/           # config.ts (user-facing, JSDoc lives here), configNormalized.ts (internal), core.ts (CollectionContext)
├── config/          # normalizer.ts (APPLY OVERRIDES HERE), context.ts (wraps as CollectionContext), access.ts (public getBunny*ForCollection accessors), defaults.ts, validator.ts
├── adapter/          # handleUpload.ts, handleDelete.ts, generateUrl.ts, staticHandler.ts — use context, never global config
├── storage/          # Bunny Storage API + S3 backend + client-direct uploads (clientUploads/)
├── stream/           # Bunny Stream API, TUS auth endpoint, hooks, cleanup task, sessions collection
├── cdn/               # Cache purging (purge.ts) + signed-URL token auth (tokenAuth.ts)
├── fields/            # bunnyData group field + field hooks
├── components/        # Admin UI (TUS upload button, client-upload handler)
├── mediaPreview/       # ./media-preview subpath — Bunny Stream adapter
├── migrations/         # ./migrations subpath — v2→v3 bunnyData migration (mongo + sql)
├── bin/                # CLIs: cli.ts (init entry), init/ (wizard), deployEdgeScript/, shared/ (Logger, bunnyFetch, envFile — reuse, don't duplicate). CLIs parse args with `cac`
├── exports/            # ./client subpath entry
├── translations/       # i18n strings
└── utils/              # shared helpers (http, mimeTypes, urlTransform, cdnUrl, constants)
```

## Architecture

Data flow:

```
User Config → Normalizer → Collection Context → Adapter → Bunny API
```

1. **User config** (`BunnyStorageConfig`) — what the user writes in `payload.config.ts`.
2. **Normalizer** (`config/normalizer.ts`) — fills defaults, validates, and merges global + per-collection overrides (the `resolveCollection*Config` family). **Apply overrides here.**
3. **Collection context** (`config/context.ts`) — wraps the already-resolved per-collection config as the runtime `CollectionContext`. No merging here.
4. **Adapter** (`adapter/*`) — consumes the context.
5. **Bunny API** — Storage or Stream endpoints.

### Always use collection context

Handlers must read from the collection context, which already has overrides applied. Never reach into global config.

```typescript
// WRONG — global config
const timeout = config.storage.uploadTimeout

// CORRECT — collection-specific config
const timeout = context.storageConfig.uploadTimeout
```

## Coding Standards

- **Comment sparingly.** Do not narrate what the code already says. Add a short comment only where the intent isn't obvious from the code or there's a real nuance (a workaround, a non-obvious constraint, a subtle edge case) that a reader would otherwise miss. JSDoc on the public config API in `src/types/config.ts` and the public accessors in `src/config/access.ts` is expected.
- **Never use global config in handlers** — use `context.storageConfig` / `context.streamConfig`, etc.
- **Handle `false` explicitly** for options that can be disabled. `purge`, `signedUrls`, `thumbnail`, and `urlTransform` are typed `false | Config`:

  ```typescript
  // CORRECT — explicit check
  purgeConfig: collectionConfig.purge === false ? undefined : collectionConfig.purge

  // WRONG — treats every falsy value as disabled
  purgeConfig: collectionConfig.purge || undefined
  ```

- **Shared CLI helpers** live in `src/bin/shared/`. Reuse the shared `Logger`/`consoleLogger` and `bunnyFetch`/`bunnyJson`; do not duplicate types or add passthrough wrappers.
- Match the surrounding code's naming and idiom.

### Adding a per-collection override

Example: add a `stream.quality` override.

1. `types/config.ts` — add `quality?: number` to the collection config type (with JSDoc).
2. `config/normalizer.ts` — add it to the `mergeDefined(...)` call in `resolveCollectionStreamConfig` (undefined values are filtered automatically). For a `false | Config`-typed option, follow the explicit-`false` pattern instead (see `resolveCollectionPurgeConfig`).
3. Update `README.md` and the docs page.

## Testing

- Unit tests live under `tests/suites/` and mirror the source layout. `pnpm test:unit` is the fast gate (no env needed).
- Live e2e (`tests/manual/*`, `pnpm test:e2e`) hits real Bunny resources and needs `.env`; keep it out of the default gate.
- Add or update tests when changing behavior.

## Commits

- Compact, one-line, Conventional-Commit style subject (e.g. `feat: add stream.quality override`).
- **No co-authored-by or copyright trailers.**
- Commit locally only. Do not push unless explicitly asked.
- Before committing: `pnpm typecheck && pnpm lint && pnpm format` all clean, and update `README.md`/docs if the change is user-facing.
- Do not commit scratch/working-note files.

## Boundaries

Ask first before:

- Large refactors or moving public API surface.
- Adding a runtime dependency.
- Committing, amending, or pushing when not explicitly requested.

Never:

- Add secrets or `.env` values to the repo.
- Push, force-push, or run destructive git operations without an explicit request.
- Bypass the collection-context rule or the explicit-`false` handling.

## References

- `README.md` — user-facing overview and quick start.
- Docs site: <https://payload-storage-bunny.seshuk.im/> (source in `docs/docs/`).
