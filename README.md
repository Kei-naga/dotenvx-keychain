# dotenvx-keychain

`dotenvx-keychain` is a CLI wrapper around `dotenvx` that stores `DOTENV_PRIVATE_KEY`
in native OS secret stores instead of keeping plaintext key material in the working
tree.

The implementation is in progress. Product and design documents live under `docs/`.

## Quick Start

This project targets Node.js 20 or newer.

If you are using WSL, use a Linux-native Node.js and npm toolchain inside WSL.
If `command -v npm` points to `/mnt/c/...`, you are using Windows npm and this
repository may fail before its scripts run.

Install dependencies:

```bash
npm install
```

Initialize a project key reference:

```bash
npx dxk init
```

On a fresh project, `init` can bootstrap the first encrypted `.env` and store the
generated `DOTENV_PRIVATE_KEY` in the native OS secret store. If the project
already has an encrypted `.env` or an existing `.dotenvx-keychain`, `init` will
reuse the existing key relationship and will not silently rotate to a new key.

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
- `darwin`: uses the macOS login keychain through `keytar`. Real-store smoke has been verified in the current development environment. If the native secret store is unavailable, verify that you are running in a logged-in user session and that the login keychain is present and unlocked in Keychain Access.
- `linux` on native Linux: requires `libsecret-1.so.0`, a working D-Bus session, and a Secret Service compatible environment. The CLI does not fall back to plaintext files or alternate stores when Secret Service is unavailable.
- `linux` on WSL: uses the current Windows user session's Credential Manager through `powershell.exe` interop while still requiring a Linux-native Node.js and npm toolchain inside WSL.
- other platforms: unsupported and expected to fail explicitly.

## Linux And WSL Requirements

On WSL, the default runtime path uses Windows Credential Manager rather than Linux Secret Service. If the native secret store is unavailable on WSL, verify that `powershell.exe` is reachable from the Linux environment and that the current Windows user session can access Credential Manager.

When Linux reports that the native secret store is unavailable, verify the following before retrying:

- the `libsecret-1.so.0` runtime library is installed and loadable
- a D-Bus session is available to the current login session
- a Secret Service compatible keyring daemon is installed and running
- the default collection is unlocked for the current user session

On Ubuntu / Debian based environments, the verified package set was:

```bash
sudo apt-get install -y libsecret-1-0 gnome-keyring libsecret-tools
```

On headless native Linux sessions, installing `gnome-keyring` may still leave the default collection uninitialized.

If `npm run test:real-store-smoke` fails with `Cannot create an item in a locked collection`, treat it as the same Secret Service prerequisite problem: the default collection exists but is still locked or not fully initialized for the current session.

If those requirements are not met, `init`, `run`, `list`, and `remove` should fail with exit code `4` instead of falling back to plaintext storage.

For the full native Linux Secret Service flow and the optional forced-Linux diagnostic path on WSL, see [docs/linux-secret-service.md](./docs/linux-secret-service.md).

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
npm run test:real-store-smoke:wsl
```

Command selection:

- `npm run test:real-store-smoke`: use for the default runtime path on macOS, Windows, native Linux, and ambient WSL.
- `npm run test:real-store-smoke:wsl`: use only when you want to force the native Linux Secret Service path inside an isolated WSL session for diagnostics.

On macOS, run `npm run test:real-store-smoke` from a normal logged-in user session with the login keychain unlocked so `keytar` can reach the native keychain APIs.

`npm run test:real-store-smoke` is treated as a release-preflight check rather than a required check on every pull request, because native keychain availability is runner-dependent, especially on Linux.

On native Linux, `npm run test:real-store-smoke` depends on `libsecret-1.so.0` being present in addition to a usable Secret Service session. On WSL, the default path depends on `powershell.exe` interop and Windows Credential Manager. When those prerequisites are missing, the built CLI should fail with exit code `4` and print recovery guidance instead of exposing backend internals or falling back to plaintext storage.

One verified native-Linux diagnostic path on Ubuntu 24.04.1 WSL2 used an isolated `dbus-run-session` plus `gnome-keyring-daemon --login` and `gnome-keyring-daemon --start --components=secrets` before running `npm run test:real-store-smoke:wsl`.

For WSL specifically, the repository also provides `npm run test:real-store-smoke:wsl`, which forces the Linux Secret Service backend inside that isolated session for comparison and troubleshooting.
