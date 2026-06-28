# Linux Secret Service and WSL Validation Notes

## 1. Purpose

- Centralize the prerequisites for using the Secret Service backend of `dotenvx-keychain` on native Linux in one place.
- Keep only the summary in the README, and move the concrete verification steps for native Linux plus the diagnostic flow for forcing the Linux backend on WSL into this document.
- Preserve the minimum steps required to reproduce `npm run test:real-store-smoke` on Linux before a release.

## 2. Scope

- `dotenvx-keychain` running on `process.platform === "linux"`
- The native Linux `keytar` backend and a Secret Service-compatible store
- Desktop Linux, headless Linux, and the WSL diagnostic flow used when you need to force the Linux backend

In normal WSL execution, `dotenvx-keychain` uses Windows Credential Manager rather than Linux Secret Service. This document is directly relevant on WSL only when you are isolating the native Linux backend or running comparative diagnostics through `npm run test:real-store-smoke:wsl`.

## 3. Required Prerequisites

The native Linux backend cannot use the store unless at least the following conditions are satisfied.

1. `libsecret-1.so.0` is installed and loadable by the `keytar` native addon.
2. Even for WSL diagnostics, `node` and `npm` must be Linux-native binaries rather than the Windows-side executables.
3. The current login session has a D-Bus session bus.
4. A Secret Service-compatible daemon is running.
5. The default collection exists and is writable.

As a supporting tool, `secret-tool` makes backend isolation easier.

If you use a Windows npm on WSL, such as `/mnt/c/.../npm`, `cmd.exe` can start from a UNC path and fail before the repository script runs. Make sure `command -v node` and `command -v npm` both resolve to Linux-side paths.

## 4. Typical Install Example on Ubuntu-family Systems

The following packages were used for the verification in this repo on Ubuntu / Debian-family systems.

```bash
sudo apt-get install -y libsecret-1-0 gnome-keyring libsecret-tools
```

- `libsecret-1-0`: runtime library required when `keytar` executes
- `gnome-keyring`: Secret Service provider
- `libsecret-tools`: provides `secret-tool` for direct backend diagnostics

## 5. Verification Order

### 5.1 Can `keytar` Load `libsecret`?

```bash
find node_modules/keytar -name '*.node' -print -exec ldd {} \;
```

Expected result:

- `libsecret-1.so.0 => /.../libsecret-1.so.0` resolves successfully
- `not found` means the runtime library is missing

### 5.2 Is Secret Service Visible on the Session Bus?

```bash
gdbus introspect --session \
  --dest org.freedesktop.secrets \
  --object-path /org/freedesktop/secrets
```

Expected result:

- `org.freedesktop.Secret.Service` is visible
- `org.freedesktop.DBus.Error.ServiceUnknown` means the provider is not installed or not running

### 5.3 Check the Default Collection Alias

```bash
dbus-send --session --print-reply \
  --dest=org.freedesktop.secrets \
  /org/freedesktop/secrets \
  org.freedesktop.Secret.Service.ReadAlias \
  string:default
```

Expected result:

- A default collection such as `object path "/org/freedesktop/secrets/collection/login"` is returned
- Even if an alias is returned, a later `Object does not exist at path ...` during store operations means the collection object is broken or uninitialized

### 5.4 Verify the Backend Directly with `secret-tool`

```bash
printf '%s' 'smoke-value' | secret-tool store \
  --label='dxk probe' \
  service dotenvx-keychain \
  account dxk-probe

secret-tool lookup service dotenvx-keychain account dxk-probe
secret-tool clear service dotenvx-keychain account dxk-probe
```

Expected result:

- Store, lookup, and clear all succeed
- If this fails, the problem is in the Secret Service session before `dotenvx-keychain` is involved

### 5.5 Run the Repository Smoke Test

```bash
npm run test:real-store-smoke
```

Expected result:

- `set/get/list/remove` all succeed

### 5.6 Use the WSL Helper Script

If you want comparative diagnostics for the native Linux backend on WSL, the ambient user session can retain a broken default collection alias. The repository therefore includes a wrapper command that starts an isolated session and forces the Linux backend.

```bash
npm run test:real-store-smoke:wsl
```

Expected result:

- It initializes `dbus-run-session` and `gnome-keyring-daemon` internally, then passes `test/smoke/realSecretStore.test.ts` on the Linux backend
- It is a comparison and diagnostic entry point for the Linux backend, not a command for validating the normal WSL runtime path

## 6. Verified Procedure for Headless Linux / WSL Diagnostics

On Ubuntu 24.04.1 LTS on WSL2, the default collection alias in the ambient user session remained broken. In that state, both `secret-tool` and `keytar` failed with `Object does not exist at path "/org/freedesktop/secrets/collection/login"`.

The minimum verified procedure that worked was as follows.

```bash
dbus-run-session -- bash

export HOME="$PWD/.tmp/wsl-keyring-home"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_CACHE_HOME="$HOME/.cache"
mkdir -p "$HOME/.local/share/keyrings" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"

printf '%s' "$KEYRING_PASSWORD" | gnome-keyring-daemon --login >/dev/null
eval "$(gnome-keyring-daemon --start --components=secrets)"

printf '%s' 'smoke-value' | secret-tool store \
  --label='dxk probe' \
  service dotenvx-keychain \
  account dxk-probe
secret-tool lookup service dotenvx-keychain account dxk-probe
secret-tool clear service dotenvx-keychain account dxk-probe

npm run test:real-store-smoke
```

If you want to reuse the same flow through a repository script, use `npm run test:real-store-smoke:wsl`.

Key points:

- Create a clean session bus with `dbus-run-session`
- Run `gnome-keyring-daemon --login` and then `--start` so that the login collection is materialized
- Use a dedicated verification HOME to avoid the broken alias in the ambient user session

## 7. Common Failure Patterns

| Symptom | Meaning | First checks |
| --- | --- | --- |
| `Failed to load the native secret store backend.` | The `keytar` addon itself could not be loaded | Whether `libsecret-1.so.0` is available and what `ldd` reports |
| `GDBus.Error:org.freedesktop.DBus.Error.ServiceUnknown` | The Secret Service provider is missing from the session bus | Whether `gnome-keyring` is installed and whether the daemon is running |
| `Object does not exist at path "/org/freedesktop/secrets/collection/login"` | The default alias exists, but the collection object is broken or uninitialized | Use an isolated D-Bus session, then run `gnome-keyring-daemon --login` and `--start` |
| `Cannot create an item in a locked collection` | The default collection is visible, but still locked | Check the collection unlock state and run `gnome-keyring-daemon --login` inside an isolated session |
| The CLI exits with code `4` | Correct behavior for an unavailable backend | Confirm that no plaintext fallback occurred |

## 8. Verified Environment for This Round

- OS: Ubuntu 24.04.1 LTS on WSL2
- Node.js: v20.20.2
- Packages: `libsecret-1-0`, `gnome-keyring`, `libsecret-tools`
- Successful path: isolated `dbus-run-session` + `gnome-keyring-daemon --login` + `--start --components=secrets`
- Unavailable path: verified exit code `4` and no secret exposure when `libsecret-1.so.0` is absent

## 9. Related Documents

- [README.md](../README.md)
- [spec.md](./spec.md)
- [designs/20-secret-store-backend.md](./designs/20-secret-store-backend.md)
- [memo/implementation-status.md](./memo/implementation-status.md)
