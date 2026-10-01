# Bunny.net Storage for Payload

Payload 4 storage adapter for Bunny.net. Wraps `@payloadcms/plugin-cloud-storage`. Features: Bunny Storage (HTTP API or S3), Bunny Stream (HLS/MP4, thumbnails, TUS uploads), client-direct uploads (presigned S3 or Edge Script), signed URLs (expiry, country, IPv4 lock), CDN purge on upload/delete, per-collection overrides (incl. own zone/library), CLI (`init` wizard, `bunny:deploy-edge-script`), subpath exports `./client` and `./media-preview`.

## Environment

- pnpm. Node.js 24.15+. Payload 4.
- Secrets come from `.env` (via `dotenv`). Never hardcode keys.
- Agent skills are not vendored: only `skills-lock.json` is committed. Restore with `npx skills experimental_install`. Build, tests and CI do not use them.

## Commands

```bash
pnpm typecheck        # tsc --noEmit
pnpm lint -f agent    # oxlint, compact output (CI needs no flag)
pnpm lint:fix
pnpm format           # oxfmt write; format:check to verify
pnpm build            # tsdown -> dist/
pnpm clean            # remove dist/ + tsbuildinfo

pnpm test:unit        # vitest, no env: default fast gate
pnpm test             # vitest with .env
pnpm test:coverage
pnpm test:e2e         # live e2e on real Bunny resources (needs .env)

pnpm dev              # dev Payload app (tests/dev.ts)
pnpm docs:dev         # Mintlify docs site (docs/)
pnpm docs:openapi     # src/server/payload/openapi.ts -> docs/v4/api-reference/openapi.json
pnpm docs:validate    # mint validate
```

Before every commit: `pnpm typecheck && pnpm lint && pnpm format`.

## Structure

Entrypoints: `index.ts` (server), `client/index.ts` (admin UI), `cli/index.ts` (bin). Dependency direction in `server/`: payload → bunny → http → shared.

```
src/
├── index.ts     # plugin entry
├── shared/      # isomorphic leaf: types/ (config.ts = public JSDoc API), translations/, constants, mimeTypes, http, urlTransform, zoneSecret
├── client/      # 'use client' entry; TusUpload/*, ClientUploadHandler
├── edge/        # uploader.edge.js (Bunny Edge Script)
├── cli/         # bin (cac); commands/ (init/, deployEdgeScript.ts); lib/ (Logger, bunnyFetch, envFile: reuse)
└── server/
    ├── http/      # shared ky client for all outbound requests
    ├── bunny/     # only Bunny API layer: client, storage, s3, stream, cdn
    ├── payload/   # config/ (normalizer, context, access, defaults, validator), fields/, storage/, stream/, openapi.ts, tokenAuth.ts, mediaPreview.ts
    ├── telemetry/ # opt-out usage telemetry, fired from index.ts onInit; imports only @/shared + node builtins
    ├── urls.ts
    └── files.ts
```

- `telemetry` option (`boolean | { endpoint?: string }`) is read from `config._original.telemetry`; no normalizer entry. Feature flags in `server/telemetry/features.ts` are booleans only, never names or values.
- `server/payload/openapi.ts` is the only OpenAPI source. `mediaPreview.ts` backs `./media-preview`.

## Architecture

`User config → Normalizer → Collection context → Adapter → Bunny API`

- Normalizer (`server/payload/config/normalizer.ts`) fills defaults, validates and merges global + per-collection overrides (`resolveCollection*Config`). Apply overrides here only.
- Context (`server/payload/config/context.ts`) wraps the resolved config. No merging.
- Adapters (`server/payload/storage/*`, `server/payload/stream/*`) read only the context:

```typescript
const timeout = config.storage.uploadTimeout // WRONG: global config
const timeout = context.storageConfig.uploadTimeout // CORRECT
```

## Coding rules

- Comment only non-obvious intent (workaround, constraint, edge case). JSDoc expected in `src/shared/types/config.ts` and `src/server/payload/config/access.ts`.
- Handle `false` explicitly for `purge`, `signedUrls`, `thumbnail`, `urlTransform` (`false | Config`):
  `collectionConfig.purge === false ? undefined : collectionConfig.purge`, never `collectionConfig.purge || undefined`.
- CLI: reuse `src/cli/lib/` (`Logger`/`consoleLogger`, `bunnyFetch`/`bunnyJson`). No duplicate types, no passthrough wrappers.
- Match surrounding naming and idiom.

New per-collection override (e.g. `stream.quality`):

1. `src/shared/types/config.ts`: add `quality?: number` with JSDoc.
2. `normalizer.ts`: add to `mergeDefined(...)` in `resolveCollectionStreamConfig`. For `false | Config` options copy `resolveCollectionPurgeConfig`.
3. Update `README.md` and `docs/v4/`.

## Testing

- Unit tests in `tests/unit/` mirror `src/`. Add or update tests for behavior changes.
- E2E (`tests/e2e/*`, `pnpm test:e2e`) hits real Bunny. Keep it out of the default gate.

## Docs

- Mintlify site in `docs/` on `main` serves both majors: v4 in `docs/v4/`, v3 at `docs/` root. Shared: `changelog.mdx`, `index.mdx`.
- User-facing change: update `README.md` and the matching docs page.
- Changed `openapi.ts`: run `pnpm docs:openapi`.

## Branches

| Branch | Major | Payload | Node   | Takes                                                        |
| ------ | ----- | ------- | ------ | ------------------------------------------------------------ |
| `main` | v4    | 4       | 24.15+ | all work; PRs target `main`                                  |
| `3.x`  | v3    | 3       | 22+    | critical/high security fixes only, cherry-picked from `main` |

`3.x` has no docs site. Its docs and changelog live on `main`.

## Releases

Tag push `vX.Y.Z[-pre.N]` runs `.github/workflows/release.yml` from the tagged commit: e2e (only if code changed since the previous tag) → lint, typecheck, format, unit, build → git-cliff notes → GitHub Release → `npm publish --provenance`. Notes for a prerelease cover commits since the previous tag; for a stable release, since the previous stable tag (so `4.0.0` lists all betas).

npm dist-tag is set automatically:

- `X.Y.Z-beta.N` → `beta` (prerelease id = tag; GitHub Release marked prerelease).
- Stable on the newest major → `latest`.
- Stable on an older major (e.g. `3.1.3` after `4.0.0`) → `latest-3`. GitHub "latest" stays on v4.

Steps, on the release branch:

1. Bump `version` in `package.json`. It is the only version source.
2. `main` only: `pnpm docs:openapi` (writes the version into `openapi.json`); add an `<Update>` entry to `docs/changelog.mdx` (and `docs/v4/upgrade-guide.mdx` if needed).
3. Gate: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:unit && pnpm build && pnpm test:e2e`.
4. Commit `chore(release): vX.Y.Z`. Create lightweight tag `vX.Y.Z` on it.
5. Push branch, then tag (only when asked).
6. `3.x` release: then on `main` add its changelog entry (and `docs/upgrade-guide.mdx` note if needed).

Tags `v*` are protected (no move, no delete). Bad release = new version, never re-tag.

A tag runs the workflow from its own commit: cherry-pick every `release.yml` change to `3.x`.

## Commits

- One-line Conventional Commit subject (`feat: add stream.quality override`). Release notes come from these.
- No co-authored-by or copyright trailers.
- Commit locally. Push only when asked.
- No scratch or working-note files.

## Boundaries

Ask first: large refactors, public API moves, new runtime dependency, commit/amend/push not requested.

Never: secrets or `.env` values in repo; push, force-push or destructive git without explicit request; bypass the collection-context rule or explicit-`false` handling.

## References

- `README.md`: user overview, quick start.
- Docs: <https://payload-storage-bunny.seshuk.im/>
