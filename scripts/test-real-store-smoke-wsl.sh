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

export DXK_LINUX_KEYRING_PASSWORD="${DXK_WSL_KEYRING_PASSWORD:-dxk-linux-smoke}"

exec bash "$repo_root/scripts/test-real-store-smoke-linux.sh"