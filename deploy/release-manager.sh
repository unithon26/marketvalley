#!/usr/bin/env bash
set -Eeuo pipefail

# Both files are installed once by a reviewed administrator. A release archive
# cannot replace the root-owned deployment control plane.
readonly managed_release_script="/usr/local/lib/marketvalley/remote-release.sh"

case "${1:-}" in
  current|deploy|rollback)
    [[ -f "${managed_release_script}" && ! -L "${managed_release_script}" ]] || {
      printf 'marketvalley release manager: trusted release script is unavailable\n' >&2
      exit 1
    }
    exec bash "${managed_release_script}" "$1"
    ;;
  *)
    printf 'usage: release-manager.sh [current|deploy|rollback]\n' >&2
    exit 1
    ;;
esac
