#!/usr/bin/env bash
set -euo pipefail

repo_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: scripts/prepare-release.sh [<version>]

Run the local release-candidate validation gate from the current branch.
If <version> is provided, it must match package.json and will be normalized
to the v-prefixed tag expected by the release-prep workflow.
EOF
}

if [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -gt 1 ]]; then
  usage >&2
  exit 2
fi

for required_command in git node npm; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Missing required command: $required_command" >&2
    exit 4
  fi
done

current_branch="$(git -C "$repo_root" branch --show-current)"

if [[ -z "$current_branch" ]]; then
  echo "Run this helper from a named branch, not a detached HEAD." >&2
  exit 2
fi

status_output="$(git -C "$repo_root" status --short)"

if [[ -n "$status_output" ]]; then
  echo "Working tree must be clean before preparing a release candidate." >&2
  printf '%s\n' "$status_output" >&2
  exit 2
fi

package_version="$(
  cd "$repo_root"
  node --input-type=module -e "import { readFileSync } from 'node:fs'; console.log(JSON.parse(readFileSync('package.json', 'utf8')).version)"
)"

release_tag="v$package_version"
requested_version="${1:-}"

if [[ -n "$requested_version" ]]; then
  if [[ ! "$requested_version" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Version must look like 1.2.3 or v1.2.3." >&2
    exit 2
  fi

  if [[ "$requested_version" == v* ]]; then
    release_tag="$requested_version"
  else
    release_tag="v$requested_version"
  fi

  if [[ "$release_tag" != "v$package_version" ]]; then
    echo "Requested tag $release_tag does not match package.json version v$package_version." >&2
    exit 2
  fi
fi

run_step() {
  local label="$1"
  shift

  echo "==> $label"
  (
    cd "$repo_root"
    "$@"
  )
}

echo "Preparing release candidate for $release_tag from branch $current_branch"

run_step "Check formatting" npm run format:check
run_step "Lint" npm run lint
run_step "Typecheck" npm run typecheck
run_step "Run test suite" npm test
run_step "Build" npm run build
run_step "Check npm pack contents" npm run pack:dry-run
run_step "Smoke test packaged CLI" npm run pack:smoke
run_step "Run release-machine real-store smoke" npm run test:real-store-smoke

if [[ "$current_branch" == "main" ]]; then
  cat <<EOF
Release-candidate gate passed for $release_tag from main.

Next steps:
1. Confirm the hosted-runner release gate remains green and rerun `npm run test:real-store-smoke` locally if you want a final release-machine check before tagging.
2. Create and push the release tag from the current main commit:
   git tag -a $release_tag -m "$release_tag"
   git push origin $release_tag
3. Wait for the Release Prep workflow to finish and confirm the uploaded tarball artifact is available.
4. Confirm the follow-on Publish workflow succeeded for the same tag.
5. If you want an extra dry run before tagging, use the manual Release Prep workflow_dispatch path; it preserves the validation and artifact steps but does not trigger Publish.
EOF
else
  cat <<EOF
Release-candidate gate passed for $release_tag from branch $current_branch.

Next steps:
1. Open or update the PR from $current_branch into main and merge it after checks pass.
2. On the merged main commit, create and push the release tag:
   git checkout main
   git pull --ff-only
   git tag -a $release_tag -m "$release_tag"
   git push origin $release_tag
3. Wait for the Release Prep workflow to finish and confirm the uploaded tarball artifact is available.
4. Confirm the follow-on Publish workflow succeeded for the same tag.
5. If you want an extra dry run before tagging, use the manual Release Prep workflow_dispatch path; it preserves the validation and artifact steps but does not trigger Publish.
EOF
fi