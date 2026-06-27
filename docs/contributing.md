# Contributing

This document defines the Git and GitHub workflow for `dotenvx-keychain`.
Behavior is defined in [spec.md](./spec.md). Update this document and the
GitHub rulesets together when the workflow changes.

## Branches

- `main`: release-ready branch for tags, GitHub Releases, and npm publishing.
- `develop`: integration branch for day-to-day work.
- `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>`:
  branch from `develop` and merge back into `develop`.
- `hotfix/<topic>`: branch from `main`, merge into `main`, then backport to
  `develop`.
- `release/*`: optional temporary branch from `develop` when a stabilization
  period is needed.

Use short kebab-case for `<topic>`.

## Flow

1. Branch from `develop` for normal work.
2. Keep PRs small and merge them into `develop`.
3. Do not open feature PRs directly into `main`.
4. Promote `develop` to `main` for releases.
5. Tag the merged `main` commit with a SemVer tag.

## Rulesets

- `main`
  - PR required
  - no force-push
  - no deletion
  - `merge` only
  - review thread resolution required
  - required approvals: `0` for now
- `develop`
  - PR required
  - no force-push
  - no deletion
  - `merge`, `squash`, and `rebase` allowed
  - review thread resolution required
  - required approvals: `0` for now

Approvals stay at `0` for now so the repository remains usable in solo
maintenance. Raise them when multiple maintainers are active.

Required status checks should use the CI job checks currently emitted by
[`CI`](../.github/workflows/ci.yml): `quality`, `test`, `package`, and
`linux-real-store-smoke`.

## Testing Policy

Start with the smallest test set that protects the v1 contract in
[spec.md](./spec.md) and the detailed test viewpoints in
[designs/70-error-security-test.md](./designs/70-error-security-test.md).

### Minimum automated scope for PRs

- unit tests for pure logic that does not require a real OS secret store
- integration tests for the CLI contract using temporary directories and test
  doubles for `dotenvx`, the secret store, and child-process spawning
- lint, typecheck, and the automated test suite must stay fast enough to run on
  every PR

Current local baseline commands:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run pack:dry-run`
- `npm run pack:smoke`
- `npm run test:real-store-smoke:linux` (Linux only)

### Minimum unit-test targets

- explicit ID validation
- auto-generated ID stability from a normalized path
- `.dotenvx-keychain` read and write behavior
- project-root lookup for `run`
- error-code mapping and secret-safe message formatting
- Windows `.cmd` and `.bat` shell fallback detection

### Minimum integration-test targets

- `init` creates `.dotenvx-keychain` with the resolved ID and leaves no
  `.env.keys`
- `init` reuses an existing config ID and fails without generating a new key
  when the store has no matching key
- `run` reads the nearest config, injects `DOTENV_PRIVATE_KEY` only into the
  child process, and propagates the child exit code
- `run` falls back to the auto-generated ID only when no config file is found
- `list` prints sorted IDs only
- `remove` deletes an exact ID match and returns the missing-key exit code when
  the ID does not exist

### Manual checks allowed at first

- real macOS Keychain and Windows Credential Manager behavior can stay as
  release-gated manual smoke tests until their CI coverage is ready
- Linux Secret Service is exercised automatically on GitHub-hosted Ubuntu by
  provisioning `libsecret`, `gnome-keyring`, and an isolated D-Bus session
- before publishing a tagged release, rerun `npm run test:real-store-smoke` on
  the release machine and keep win32 / darwin native-store sign-off outside
  GitHub-hosted runners for now

For Linux / WSL environment prerequisites and the verified Secret Service smoke
flow, refer to [linux-secret-service.md](./linux-secret-service.md).

### Exit criteria for required status checks

- at least one integration test must cover each acceptance criterion in
  [spec.md](./spec.md)
- secret values must never appear in snapshots, assertion messages, or failure
  output
- keep the `quality`, `test`, `package`, and `linux-real-store-smoke` CI job
  checks required on `develop` and `main`

## GitHub Actions

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on pull
  requests into and pushes to `develop` and `main`
- the CI workflow enforces `npm run format:check`, `npm run lint`,
  `npm run typecheck`, `npm test`, `npm run build`, `npm run pack:dry-run`,
  `npm run pack:smoke`, and `npm run test:real-store-smoke:linux`
- [`.github/workflows/release-prep.yml`](../.github/workflows/release-prep.yml)
  runs on SemVer tags and optional manual dispatch, reruns the CI gate plus
  the Linux real-store smoke, and uploads a release tarball artifact
- `release-prep` does not publish to npm; maintainers must complete the manual
  native-store smoke gate before tagging a release from the merged `main`
  commit

## Not Enforced Yet

- Limit PRs into `main` to `develop`, `release/*`, and `hotfix/*`.
- Require CODEOWNERS review.
- Promote darwin / win32 real-store smoke into CI coverage.
- Automate npm publish.

## Review This Strategy When

- more people are developing in parallel
- `main` needs one or more required approvals
- maintenance branches become necessary
- darwin / win32 native-store smoke is stable enough for CI coverage
- release preparation should draft GitHub Releases or publish to npm
