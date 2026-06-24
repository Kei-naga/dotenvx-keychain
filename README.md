# dotenvx-keychain

`dotenvx-keychain` is a CLI wrapper around `dotenvx` that stores `DOTENV_PRIVATE_KEY`
in native OS secret stores instead of keeping plaintext key material in the working
tree.

The implementation is in progress. Product and design documents live under `docs/`.

## Quick Start

This project targets Node.js 20 or newer.

Install dependencies:

```bash
npm install
```

Initialize a project key reference:

```bash
npx dxk init
```

Run a command through bundled `dotenvx` with the stored key:

```bash
npx dxk run -- node app.js
```

List or remove stored IDs:

```bash
npx dxk ls
npx dxk rm <id>
```

## What Gets Stored

- `.dotenvx-keychain` stores only the project `id`.
- `DOTENV_PRIVATE_KEY` is stored in the native OS secret store.
- `run` injects `DOTENV_PRIVATE_KEY` only into the spawned child process.
- If `DOTENV_PRIVATE_KEY` is already set in the parent environment, `run` uses it and does not read the local config or secret store.

## Platform Notes

- `win32`: uses the native Windows secret store through `keytar`. Real-store smoke has been verified in the current development environment.
- `darwin`: supported target platform. Real-store smoke still needs to be recorded before initial release.
- `linux`: requires a working Secret Service compatible environment. The CLI does not fall back to plaintext files or alternate stores when Secret Service is unavailable.
- other platforms: unsupported and expected to fail explicitly.

## Linux Secret Service Requirements

When Linux reports that the native secret store is unavailable, verify the following before retrying:

- a D-Bus session is available to the current login session
- a Secret Service compatible keyring daemon is installed and running
- the default collection is unlocked for the current user session

If those requirements are not met, `init`, `run`, `list`, and `remove` should fail with a non-zero exit instead of falling back to plaintext storage.

## Exit Codes

- `0`: success
- `2`: usage or input error
- `3`: key not found for the resolved ID
- `4`: `dotenvx` or native secret store failure
- `5`: security-sensitive post-processing failure such as `.env.keys` cleanup

## CI And Production Usage

- Prefer pre-injecting `DOTENV_PRIVATE_KEY` in CI and production jobs.
- Do not rely on the local OS secret store in ephemeral CI environments.
- `dxk run -- ...` will honor a pre-injected `DOTENV_PRIVATE_KEY` and skip local config and store lookup.

## Development

Run the test suite:

```bash
npm test
```

Useful verification commands during development:

```bash
npm run typecheck
npm run build
npm run pack:smoke
npm run test:real-store-smoke
```

`npm run test:real-store-smoke` is treated as a release-preflight check rather than a required check on every pull request, because native keychain availability is runner-dependent, especially on Linux.
