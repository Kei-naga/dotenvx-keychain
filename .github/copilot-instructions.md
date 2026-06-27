# Copilot Instructions

## Repository at a glance

- `dotenvx-keychain` is a TypeScript ESM CLI that wraps `dotenvx` and moves `DOTENV_PRIVATE_KEY` into the native OS secret store instead of leaving key material in the working tree.
- The repository is centered on one npm package. Runtime code is under `src/`, tests are under `test/`, and behavior/design docs are under `docs/`.
- Docs are mostly Japanese. Runtime code and tests are in English.
- Target runtime is Node.js 20+.
- Non-obvious dependencies: `@dotenvx/dotenvx` is a bundled runtime dependency that the CLI resolves from `node_modules`, and `keytar` is the native secret-store backend.
- Root files you will reach for first: `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `README.md`, `docs/spec.md`, and `docs/contributing.md`.
- Package scripts are the primary local validation surface.

## Use this command order

- Always run `npm install` first in a fresh checkout.
- After install, `npm test` can run before `npm run build`; the default test suite does not depend on `dist/`.
- Always run `npm run build` before direct repo execution such as `node dist/index.js help`.
- Always run `npm run build` before `npm run pack:dry-run`; that script does not build for you and the published package is expected to include `dist/`.
- `npm run pack:smoke` already performs its own build.
- Recommended sequence from a fresh checkout:
  1. `npm install`
  2. `npm run lint`
  3. `npm run typecheck`
  4. `npm test`
  5. `npm run build`
  6. `node dist/index.js help`
  7. `npm run pack:dry-run`
  8. `npm run pack:smoke`
  9. `npm run test:real-store-smoke`
- `npm run test:real-store-smoke` touches the live OS secret store and is optional for most changes. Run it when you change `src/secretStore/*`, platform detection, or native integration behavior.

## Architecture map

- `src/index.ts` is the CLI entry point and only calls `dispatch(...)`.
- `src/cli/parseArgs.ts` owns CLI syntax and aliases: `init`, `run -- ...`, `list` / `ls`, `remove` / `rm`.
- `src/cli/dispatcher.ts` prints usage and routes to command handlers.
- `src/cli/processRunner.ts` owns child-process launch and the Windows-only `.cmd` / `.bat` shell exception.
- `src/commands/init.ts` orchestrates ID resolution, key source resolution, secret-store writes, config writes, rollback, and `.env.keys` cleanup.
- `src/commands/run.ts` resolves the nearest project, fetches the key, and executes bundled `dotenvx run -- ...`.
- `src/commands/list.ts` and `src/commands/remove.ts` are thin admin commands.
- `src/config/configFile.ts` defines the `.dotenvx-keychain` file format.
- `src/config/id.ts` owns ID validation and automatic ID generation.
- `src/config/idResolver.ts` resolves the init ID and the nearest config for `run`.
- `src/dotenvx/resolver.ts` resolves the bundled `@dotenvx/dotenvx` binary from `node_modules`.
- `src/dotenvx/adapter.ts` reads a local key via `dotenvx keypair DOTENV_PRIVATE_KEY`.
- `src/secretStore/interface.ts`, `src/secretStore/factory.ts`, and `src/secretStore/backends/keytarStore.ts` own the native secret store abstraction and `keytar` integration.
- `src/secretStore/mock/mockSecretStore.ts` is the test double used by command tests.
- `test/cli`, `test/commands`, `test/config`, and `test/secretStore` are the default `npm test` suite.
- `test/smoke/packagedCli.test.ts` validates `npm pack`, install, both bin names, and bundled `dotenvx` resolution.
- `test/smoke/realSecretStore.test.ts` validates live `set/get/list/remove` against the current platform store.
- `docs/spec.md` is the authoritative behavior contract. `docs/designs/*.md` map closely to the source layout and are the fastest way to understand intent before editing behavior.
- Use `docs/spec.md` and `docs/contributing.md` for behavior and validation policy.

## Repo-specific behavior that affects edits

- This is a thin wrapper, not a replacement for `dotenvx`. Do not add global `dotenvx` assumptions; the CLI must resolve the bundled dependency and work from the published tarball.
- `run` short-circuits if `DOTENV_PRIVATE_KEY` is already present in the parent environment. In that path it should not read config or the secret store.
- `run` searches upward for the nearest `.dotenvx-keychain`. If none exists, it falls back to an auto-generated ID derived from the current real path.
- `init` reuses an existing store value, a non-empty parent `DOTENV_PRIVATE_KEY`, or a locally readable `dotenvx` key first. When no reusable key exists and neither a local config nor an encrypted `.env` is already present, it may bootstrap the first encrypted `.env` in an isolated temp directory.
- Successful `init` should leave `.env.keys` absent from the project root.
- Exit codes are stable and tested: `0` success, `2` usage or input error, `3` key not found, `4` infrastructure or dependency failure, `5` post-processing cleanup failure.
- `keytar` is a native dependency. Linux support depends on a working Secret Service environment; unsupported platforms must fail rather than fall back to plaintext.

## Working norms

- Replicate the main local gate with `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run pack:smoke`.
- Start from the file map above and trust these instructions first. Only search the repo when the requested change touches a surface that is not covered here or when observed behavior contradicts this document.
