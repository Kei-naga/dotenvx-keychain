#!/usr/bin/env bash
set -euo pipefail

repo_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This helper only supports Linux environments." >&2
  exit 2
fi

if [[ ! -r /proc/sys/kernel/osrelease ]] || ! grep -qi microsoft /proc/sys/kernel/osrelease; then
  echo "This helper is intended for WSL. Use npm run test:real-store-smoke on other Linux environments." >&2
  exit 2
fi

for required_command in dbus-run-session gnome-keyring-daemon; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Missing required command: $required_command" >&2
    exit 4
  fi
done

work_home="$repo_root/.tmp/wsl-keyring-home"
keyring_password="${DXK_WSL_KEYRING_PASSWORD:-dxk-linux-smoke}"

rm -rf "$work_home"
mkdir -p "$work_home/.local/share/keyrings" "$work_home/.config" "$work_home/.cache"

export DXK_WSL_REPO_ROOT="$repo_root"
export DXK_WSL_KEYRING_HOME="$work_home"
export DXK_WSL_KEYRING_PASSWORD="$keyring_password"

dbus-run-session -- bash -lc '
set -euo pipefail

export HOME="$DXK_WSL_KEYRING_HOME"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_CACHE_HOME="$HOME/.cache"

printf "%s" "$DXK_WSL_KEYRING_PASSWORD" | gnome-keyring-daemon --login >/dev/null
eval "$(gnome-keyring-daemon --start --components=secrets)"

cd "$DXK_WSL_REPO_ROOT"
./node_modules/.bin/vitest run test/smoke/realSecretStore.test.ts
'