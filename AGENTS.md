# Bunny.net Storage for Payload

Payload 4 storage adapter for Bunny.net. Wrap `@payloadcms/plugin-cloud-storage`. Features: Bunny Storage (HTTP API or S3), Bunny Stream (HLS/MP4, thumbnails, TUS uploads), client-direct uploads (presigned S3 or Edge Script), signed URLs (expiry, country, IPv4 lock), CDN purge on upload/delete, per-collection overrides (own zone/library too), CLI (`init` wizard, `bunny:deploy-edge-script`), subpath exports `./client`, `./media-preview`.

## Environment

- pnpm 12. Node.js 24.15+. Payload 4.
- Shared dev config from `@seshuk/payload-plugin-tooling` (oxlint, oxfmt, tsconfig, tsdown, test DB).
- Secrets from `.env` (`dotenv`). Never hardcode keys.
- Agent skills not vendored: only `skills-lock.json` committed. Restore: `npx skills experimental_install`. Build, tests, CI not use them.

## Commands

```bash
pnpm typecheck        # tsc --noEmit
pnpm lint -f agent    # oxlint, compact output (CI no flag)
pnpm lint:fix
pnpm format           # oxfmt write; format:check to verify
pnpm build            # tsdown -> dist/
pnpm clean            # remove dist/ + tsbuildinfo

pnpm test:unit        # tests/unit, no env: default fast gate
pnpm test:int         # tests/integration (.env); TEST_DB=sqlite|postgres|mongodb in memory, default sqlite
pnpm test             # unit + int with .env
pnpm test:coverage
pnpm test:e2e         # live e2e on real Bunny resources (.env)

pnpm dev              # dev Payload app (tests/dev.ts)
pnpm docs:dev         # Mintlify docs site (docs/)
pnpm docs:openapi     # src/server/payload/openapi.ts -> docs/v4/api-reference/openapi.json
pnpm docs:validate    # mint validate
```

Before every commit: `pnpm typecheck && pnpm lint && pnpm format`.

## Structure

Entrypoints: `index.ts` (server), `client/index.ts` (admin UI), `cli/index.ts` (bin). Dependency direction in `server/`: payload → bunny → http → shared. Enforced by `oxlint.config.ts` overrides.

```
src/
├── index.ts     # plugin entry
├── shared/      # isomorphic leaf: types/ (options.ts = public JSDoc API), translations/, constants, mimeTypes, http, urlTransform, zoneSecret
├── client/      # 'use client' entry; TusUpload/*, ClientUploadHandler
├── edge/        # uploader.edge.js (Bunny Edge Script)
├── cli/         # bin (cac); commands/ (init/, deployEdgeScript.ts); lib/ (Logger, bunnyFetch, envFile: reuse)
└── server/
    ├── http/      # shared ky client, all outbound requests
    ├── bunny/     # Bunny API layer only: client, storage, s3, stream, cdn
    ├── payload/   # options/ (normalizer, context, access, defaults, validator), fields/, storage/, stream/, openapi.ts, tokenAuth.ts, mediaPreview.ts
    ├── telemetry/ # opt-out usage telemetry, fired from index.ts onInit; imports only @/shared + node builtins
    ├── urls.ts
    └── files.ts
tests/
├── vitest.config.ts # projects: unit, int
├── unit/            # mirror src/
├── integration/     # *.int.spec.ts, DB from tooling testDatabase()
├── e2e/             # live Bunny, Playwright
└── helpers/, suites/, fixtures/, manual/
```

- `telemetry` option (`boolean | { url?: string }`) read from `options._original.telemetry`; no normalizer entry. Feature flags in `server/telemetry/features.ts` booleans only, never names or values.
- `server/payload/openapi.ts` only OpenAPI source. `mediaPreview.ts` back `./media-preview` (optional peer `@seshuk/payload-plugin-media-preview` 2.x).

## Architecture

`User options → Normalizer → Collection context → Adapter → Bunny API`

- Normalizer (`server/payload/options/normalizer.ts`): fill defaults, validate, merge global + per-collection overrides (`resolveCollection*Options`). Overrides applied here only.
- Context (`server/payload/options/context.ts`): wrap resolved options. No merging.
- Adapters (`server/payload/storage/*`, `server/payload/stream/*`): read context only.

```typescript
const timeout = options.storage.uploadTimeout // WRONG: global options
const timeout = context.storageOptions.uploadTimeout // CORRECT
```

## Coding rules

- No code comments. Only JSDoc on plugin options types (`src/shared/types/options.ts`).
- `false` handled explicitly for `purge`, `signedUrls`, `thumbnail`, `urlTransform` (`false | Options`): `collectionOptions.purge === false ? undefined : collectionOptions.purge`, never `collectionOptions.purge || undefined`. `collections.<slug>: false` = collection not managed (skipped in normalizer and `getCloudStorageCollections`).
- Removed/renamed v2/v3 keys: add to `REMOVED_KEYS` in `validator.ts`. `assertNoRemovedKeys` throws `[@seshuk/payload-storage-bunny] <old> was removed, use <new>` / `... was renamed to ...`, also with `enabled: false`. No aliases.
- `accountApiKey` = top-level only. Never nest under `purge` or a collection. Purge URL = plain CDN URL + `*`, never transformed/signed URL.
- Regions: `src/shared/regions.ts` (`REGIONS`) = only region list. Feeds `StorageRegion` and CLI `init` (`plan.ts`). Docs table `docs/v4/configuration/storage/overview.mdx#regions` must match (unit test). Runtime never validates region.
- Option with function form gets the inherited value as `defaultValue` (`signedUrls.expiresIn`) or `defaultAccess()` (`stream.tus.access`).
- Imports end in `.js`. `@/` (= `src/`) for import that leave folder, `./x.js` only in same folder, no `../`.
- CLI: reuse `src/cli/lib/` (`Logger`/`consoleLogger`, `bunnyFetch`/`bunnyJson`). No duplicate types, no passthrough wrappers.
- Match surrounding naming and idiom.

New per-collection override (e.g. `stream.quality`):

1. `src/shared/types/options.ts`: add `quality?: number` with JSDoc.
2. `normalizer.ts`: add to `mergeDefined(...)` in `resolveCollectionStreamOptions`. `false | Options` option: use `resolveCollectionOption`.
3. Update `README.md` and `docs/v4/`.

## Testing

- `tests/unit/` mirror `src/`. Behavior change: add or update test.
- `describe` = function or feature (`purgeCache`, `options validator`); `it` = present-tense verb, plain English (`throws when …`), never `should …`.
- E2E (`tests/e2e/*`, `pnpm test:e2e`) hit real Bunny. Keep out of default gate.

## Docs

- Mintlify site in `docs/` on `main` serve both majors: v4 in `docs/v4/`, v3 at `docs/` root. Shared: `changelog.mdx`, `index.mdx`.
- User-facing change: update `README.md` and matching docs page.
- Changed `openapi.ts`: run `pnpm docs:openapi`.

## Branches

| Branch | Major | Payload | Node   | Takes                                                        |
| ------ | ----- | ------- | ------ | ------------------------------------------------------------ |
| `main` | v4    | 4       | 24.15+ | all work; PRs target `main`                                  |
| `3.x`  | v3    | 3       | 22+    | critical/high security fixes only, cherry-picked from `main` |

`3.x` has no docs site. Its docs and changelog live on `main`.

## Releases

Tag push `vX.Y.Z[-pre.N]` run `.github/workflows/release.yml` from tagged commit: e2e (only if code changed since previous tag) → lint, typecheck, format, unit, build → git-cliff notes → GitHub Release → `npm publish --provenance`. Prerelease notes: commits since previous tag. Stable notes: since previous stable tag (`4.0.0` list all betas).

npm dist-tag automatic:

- `X.Y.Z-beta.N` → `beta` (prerelease id = tag; GitHub Release marked prerelease).
- Stable on newest major → `latest`.
- Stable on older major (`3.1.3` after `4.0.0`) → `latest-3`. GitHub "latest" stay on v4.

Steps, on release branch:

1. Bump `version` in `package.json`. Only version source.
2. `main` only: `pnpm docs:openapi` (write version into `openapi.json`); add `<Update>` entry to `docs/changelog.mdx` (and `docs/v4/upgrade-guide.mdx` if needed).
3. Gate: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:unit && pnpm build && pnpm test:e2e`.
4. Commit `chore(release): vX.Y.Z`. Lightweight tag `vX.Y.Z` on it.
5. Push branch, then tag (only when asked).
6. `3.x` release: then on `main` add changelog entry (and `docs/upgrade-guide.mdx` note if needed).

Tags `v*` protected (no move, no delete). Bad release = new version, never re-tag. Tag run workflow from own commit: cherry-pick every `release.yml` change to `3.x`.

## Commits

- One-line Conventional Commit (`feat: add stream.quality override`). Release notes come from these.
- No co-authored-by or copyright trailers.
- Commit locally. Push only when asked.
- No scratch or working-note files.

## Boundaries

Ask first: large refactor, public API move, new runtime dependency, commit/amend/push not requested.

Never: secrets or `.env` values in repo; push, force-push or destructive git without explicit request; bypass collection-context rule or explicit-`false` handling.

## References

- `README.md`: user overview, quick start.
- Docs: <https://payload-storage-bunny.seshuk.im/>
