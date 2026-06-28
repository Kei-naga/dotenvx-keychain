# Contributing

This document defines the Git and GitHub workflow and maintainer validation
workflow for `dotenvx-keychain`.

The public end-user guide lives in [README.md](../README.md). Behavior is
defined in [spec.md](./spec.md). Update this document and the GitHub rulesets
together when the workflow changes.

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
[`CI`](../.github/workflows/ci.yml): `quality`, `test`, `package`,
`linux-real-store-smoke`, `macos-real-store-smoke`, and
`windows-real-store-smoke`.

## Local Development And Validation

Use this section for maintainer-facing verification. The public README should
stay focused on install and runtime usage.

### Command sequence

From a fresh checkout, use this order:

1. `npm install`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`
6. `node dist/index.js help`
7. `npm run pack:dry-run`
8. `npm run pack:smoke`
9. `npm run test:real-store-smoke` when the change touches native-store behavior or you are preparing a release

Notes:

- `npm test` does not depend on `dist/`, so it can run before `npm run build`.
- Run `npm run build` before direct repository execution such as `node dist/index.js help`.
- Run `npm run build` before `npm run pack:dry-run`; that script does not build for you.
- `npm run pack:smoke` already performs its own build.

### Choosing the right smoke test

- `npm run test:real-store-smoke`: default runtime-path smoke for macOS, Windows, native Linux, and ambient WSL.
- `npm run test:real-store-smoke:wsl`: use only when you want to force the Linux Secret Service backend inside an isolated WSL session for comparison or diagnostics.
- `npm run test:real-store-smoke:linux`: CI-style Linux helper that provisions an isolated Secret Service session on Linux.

Platform notes:

- On macOS, run `npm run test:real-store-smoke` from a normal logged-in user session with the login keychain unlocked.
- On native Linux, `npm run test:real-store-smoke` depends on `libsecret-1.so.0` plus a usable Secret Service session.
- On WSL, use a Linux-native Node.js and npm toolchain. If `command -v npm` points to `/mnt/c/...`, fix the toolchain before repo scripts.
- For Linux and WSL prerequisites, troubleshooting, and the forced-Linux diagnostic flow, see [linux-secret-service.md](./linux-secret-service.md).

### Release-oriented local checks

- `npm run release:prepare -- <version>` expects a clean working tree, reruns the local release-candidate gate, reruns `npm run test:real-store-smoke` on the current machine, and prints the next `main` / tag / publish steps.
- Treat `npm run test:real-store-smoke` as a release-preflight check in addition to CI, especially for native keychain behavior on macOS and Windows.

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

- Linux Secret Service is exercised automatically on GitHub-hosted Ubuntu by
  provisioning `libsecret`, `gnome-keyring`, and an isolated D-Bus session
- macOS Keychain and Windows Credential Manager are exercised automatically on
  GitHub-hosted runners through `npm run test:real-store-smoke`
- before publishing a tagged release, you may still rerun
  `npm run test:real-store-smoke` on the release machine as a final
  environment-specific check

For Linux / WSL environment prerequisites and the verified Secret Service smoke
flow, refer to [linux-secret-service.md](./linux-secret-service.md).

### Exit criteria for required status checks

- at least one integration test must cover each acceptance criterion in
  [spec.md](./spec.md)
- secret values must never appear in snapshots, assertion messages, or failure
  output
- keep the `quality`, `test`, `package`, `linux-real-store-smoke`,
  `macos-real-store-smoke`, and `windows-real-store-smoke` CI job checks
  required on `develop` and `main`

## GitHub Actions

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on pull
  requests into and pushes to `develop` and `main`
- the CI workflow enforces `npm run format:check`, `npm run lint`,
  `npm run typecheck`, `npm test`, `npm run build`, `npm run pack:dry-run`,
  `npm run pack:smoke`, `npm run test:real-store-smoke:linux`, and
  `npm run test:real-store-smoke` on GitHub-hosted macOS and Windows runners
- [`.github/workflows/release-prep.yml`](../.github/workflows/release-prep.yml)
  runs on SemVer tags and optional manual dispatch, reruns the Linux release
  gate plus macOS and Windows native-store smoke, and uploads a release
  tarball artifact only after all three OS validations succeed
- on SemVer tag pushes, `release-prep` also validates that the tag matches
  `package.json` and is cut from a commit reachable from `main`
- on manual `workflow_dispatch`, `release-prep` still reruns the same
  Linux/macOS/Windows validation jobs and artifact upload, but it skips the
  tag-versus-`package.json` and reachable-from-`main` checks that only run on
  SemVer tag pushes, then intentionally stops after artifact upload
- [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) runs only
  after a successful tag-triggered `release-prep` run, downloads that run's
  uploaded tarball artifact, and publishes the exact tarball to npm
- after the first green run of the new hosted-runner jobs, update the GitHub
  rulesets so `macos-real-store-smoke` and `windows-real-store-smoke` become
  required on `develop` and `main`
- configure the repository `NPM_TOKEN` Actions secret with an npm automation
  token before relying on tag-driven publish

## First Public Release Checklist

- confirm that public docs still match the shipped `init` bootstrap contract
- on the release candidate, run `npm run format:check`, `npm run lint`,
  `npm run typecheck`, `npm test`, `npm run build`, `npm run pack:dry-run`,
  and `npm run pack:smoke`
- use `npm run release:prepare -- <version>` when you want one clean entry
  point for that local gate plus the release-machine `npm run test:real-store-smoke`
- rerun `npm run test:real-store-smoke` on the release machine before pushing the release tag when you want a final environment-specific check
- create the SemVer tag from the merged `main` commit only after the hosted-runner checks succeed
- verify the `release-prep` artifact upload and the downstream `Publish`
  workflow result
- use the manual `release-prep` workflow_dispatch path when you want a hosted
  preflight rerun without triggering `Publish`

## Not Enforced Yet

- Limit PRs into `main` to `develop`, `release/*`, and `hotfix/*`.
- Require CODEOWNERS review.

## Review This Strategy When

- more people are developing in parallel
- `main` needs one or more required approvals
- maintenance branches become necessary
- release automation should draft GitHub Releases or add publish approval gates
