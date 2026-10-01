# Contributing

Thanks for helping with the Bunny.net storage adapter for Payload. This guide covers the setup, the rules the code follows, and how pull requests get reviewed.

## Before you start

- For a bug, open an issue with steps to reproduce first, unless the fix is small and obvious.
- For a new feature or a change to the public config, open an issue first and describe the use case. It saves you work if the idea doesn't fit the plugin.
- For security problems, don't open an issue. Follow [SECURITY.md](SECURITY.md).

## Setup

You need Node.js 24.15+ and pnpm 12.

```bash
pnpm install
pnpm test:unit
```

Unit tests need no Bunny account. The dev app, integration tests and e2e run against real Bunny resources, so they need your own account and a `.env` file.

## Bunny resources for tests

Use separate zones and libraries for tests, never ones with real content. The tests upload and delete files and videos. Test resources cost a few cents a month.

1. Copy your account API key from the account settings in the [bunny.net dashboard](https://dash.bunny.net/).
2. Copy the example file:

   ```bash
   cp .env.example .env
   ```

3. Create the test resources:

   ```bash
   pnpm test:provision --api-key <your-account-api-key>
   ```

   The script creates three storage zones (plain, signed URLs, S3), their pull zones, and two Stream libraries (plain and signed URLs). All names start with `psb-e2e`. Change it with `--prefix`, but keep storage zone names within 20 characters. Pick the main region with `--region` (default `DE`). Use `--dry-run` to see the plan first. Running it again reuses resources that already exist.

4. The script prints a `.env` block with every name, key and hostname. Paste it into `.env` over the matching lines.
5. Set `PAYLOAD_SECRET` to any random string. `DATABASE_URI` is only needed for `pnpm dev`. Tests and e2e start an in-memory database.
6. Optional: the Edge Script tests need a deployed uploader. Deploy it to your plain storage zone and paste the two printed lines (`BUNNY_EDGE_SCRIPT_URL`, `BUNNY_EDGE_SECRET`) into `.env`:

   ```bash
   pnpm exec dotenv -e .env -- pnpm test:deploy-edge
   ```

   Without these values, the Edge Script suite is skipped.

When you're done, delete the `psb-e2e-*` zones and libraries in the dashboard.

Never commit `.env` or paste keys into issues, PRs or logs.

## Commands

```bash
pnpm typecheck      # tsc --noEmit
pnpm lint           # oxlint
pnpm format         # oxfmt
pnpm test:unit      # fast unit tests, no .env needed
pnpm test           # integration tests against Bunny (needs .env)
pnpm test:e2e       # browser e2e against Bunny (needs .env)
pnpm dev            # dev Payload app
pnpm docs:dev       # docs site
```

Run `pnpm typecheck && pnpm lint && pnpm format && pnpm test:unit` before you push.

## Code rules

- **Read settings from the collection context.** Handlers use `context.storageConfig`, `context.streamConfig` and so on, never the global config. Per-collection overrides are already applied there.
- **Apply overrides in the normalizer.** A new per-collection option goes into the config type in `src/shared/types/config.ts` (with JSDoc) and into the matching `resolveCollection*Config` in `src/server/payload/config/normalizer.ts`.
- **Check `false` explicitly** for options that can be disabled (`purge`, `signedUrls`, `thumbnail`, `urlTransform`). Write `value === false ? undefined : value`, not `value || undefined`.
- **Keep the layers.** Inside `src/server/`, `payload/` may use `bunny/`, `bunny/` may use `http/`, and all of them may use `src/shared/`. Only `src/server/bunny/` talks to the Bunny API.
- **Comment sparingly.** Name things so the code explains itself. Add a comment only for a workaround or a constraint a reader would miss. The public config types and accessors keep their JSDoc.
- **Match the surrounding code.** Follow the naming and patterns already used in the file you change.
- **Ask before adding a runtime dependency.** Say why in the issue or PR.

## Tests

- Add or update tests for every behavior change.
- Unit tests live in `tests/unit/` and mirror the `src/` layout.
- A bug fix should come with a test that fails without the fix.
- Don't commit `.only`, `.skip` or placeholder tests.

## Docs

If users will notice the change, update `README.md` and the matching page in `docs/v4/`. The pages at the root of `docs/` are the v3 docs, so change them only for a v3 fix. If you change `src/server/payload/openapi.ts`, run `pnpm docs:openapi`.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/) with a short, one-line subject, for example `fix: keep TUS mode after the bulk drawer closes` or `feat: add stream.quality override`. The release changelog is built from these.
- Keep each PR focused on one change. Open it against `main`, which holds v4. The `3.x` branch only takes critical and high-severity security fixes, which are cherry-picked from `main` where possible.
- Fill in the PR template: what changed, why, and how you tested it. Link the issue (`Closes #123`).
- CI must pass. It runs lint, typecheck, format check, unit tests and the build on Node 24 (`3.x`: Node 22 and 24).
- E2E runs against real Bunny resources. It starts automatically for branches in this repository when a PR changes code, tests or dependencies. For a PR from a fork, a maintainer approves the run after reading the diff, because the tests run with the project's Bunny keys. Dependabot PRs skip e2e; every release runs it once before publishing.
- All review threads need to be resolved before merge.

## License

By contributing, you agree that your work is released under the [MIT License](LICENSE).
