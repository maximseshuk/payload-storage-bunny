# Manual test scripts

Small Node scripts that talk to a real Bunny account. They set up and check the resources the
e2e and signed-URL suites need. They are not part of `pnpm test:unit` and they create billable
resources, so run them by hand.

All scripts read credentials from `.env`.

## Scripts

| Command                 | What it does                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:provision`   | Create 3 storage zones (plain, signed, S3) and 2 stream libraries (plain, signed), then print an `.env` block. Idempotent — existing resources are reused. Try `--dry-run` first.   |
| `pnpm test:deploy-edge` | Deploy the client-upload Edge Script and harden its pull zone. Prints `BUNNY_EDGE_SCRIPT_URL` and `BUNNY_EDGE_SECRET`. Add `--check` to compare the live version with the plugin's. |
| `pnpm test:verify-edge` | Upload a file through the deployed Edge Script, read it back, and check that an unsigned upload is rejected.                                                                        |
| `pnpm test:verify-s3`   | Upload and delete a file through the S3 backend (server side) and through a presigned PUT (client side).                                                                            |

## Environment variables

`test:provision` prints all of these; paste them into `.env`.

- `BUNNY_API_KEY` — account API key.
- `BUNNY_STORAGE_*` — plain storage zone (`_ZONE_NAME`, `_API_KEY`, `_HOSTNAME`).
- `BUNNY_SIGNED_STORAGE_*` — storage zone with token auth (adds `_TOKEN_SECURITY_KEY`).
- `BUNNY_S3_STORAGE_*` — S3-compatible zone (adds `_REGION`, e.g. `de`).
- `BUNNY_STREAM_*` / `BUNNY_SIGNED_STREAM_*` — stream libraries.
- `BUNNY_EDGE_SCRIPT_URL` / `BUNNY_EDGE_SECRET` — printed by `test:deploy-edge`.

## Good to know

- Storage zone names are capped at 20 characters, so the default prefix is short (`psb-e2e`).
- The Edge Script is versioned by a hash of its source. `test:deploy-edge --check` tells you when a redeploy is due.
- Deploys are idempotent, so re-running to update is safe.
