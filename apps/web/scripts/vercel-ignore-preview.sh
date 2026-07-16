#!/usr/bin/env bash
# Exit 0 => skip this deployment. Exit 1 => continue build.
#
# Default: skip non-production deploys for this app directory.
# Exception: always build lore-keeper (PR preview project).
set -euo pipefail

prod_url="${VERCEL_PROJECT_PRODUCTION_URL:-}"

case "$prod_url" in
  *lore-keeper*)
    exit 1
    ;;
esac

case "${VERCEL_GIT_COMMIT_REF:-}" in
  main|stable) exit 1 ;;
  *) exit 0 ;;
esac
