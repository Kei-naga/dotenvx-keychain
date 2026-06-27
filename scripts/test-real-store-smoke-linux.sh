#!/usr/bin/env bash
set -euo pipefail

repo_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This helper only supports Linux environments." >&2
  exit 2
fi

for required_command in dbus-run-session gnome-keyring-daemon secret-tool; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Missing required command: $required_command" >&2
    exit 4
  fi
done

work_home="$repo_root/.tmp/linux-keyring-home"
keyring_password="${DXK_LINUX_KEYRING_PASSWORD:-dxk-linux-smoke}"

trap 'rm -rf "$work_home"' EXIT

rm -rf "$work_home"
mkdir -p "$work_home/.local/share/keyrings" "$work_home/.config" "$work_home/.cache"

export DXK_LINUX_REPO_ROOT="$repo_root"
export DXK_LINUX_KEYRING_HOME="$work_home"
export DXK_LINUX_KEYRING_PASSWORD="$keyring_password"
export DXK_WSL_USE_LINUX_SECRET_SERVICE="1"

dbus-run-session -- bash -lc '
set -euo pipefail

export HOME="$DXK_LINUX_KEYRING_HOME"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_CACHE_HOME="$HOME/.cache"
export DXK_WSL_USE_LINUX_SECRET_SERVICE="$DXK_WSL_USE_LINUX_SECRET_SERVICE"

printf "%s" "$DXK_LINUX_KEYRING_PASSWORD" | gnome-keyring-daemon --login >/dev/null
eval "$(gnome-keyring-daemon --start --components=secrets)"

printf "%s" "smoke-value" | secret-tool store \
  --label="dxk probe" \
  service dotenvx-keychain \
  account dxk-probe
secret-tool lookup service dotenvx-keychain account dxk-probe >/dev/null
secret-tool clear service dotenvx-keychain account dxk-probe

cd "$DXK_LINUX_REPO_ROOT"
./node_modules/.bin/vitest run test/smoke/realSecretStore.test.ts
'