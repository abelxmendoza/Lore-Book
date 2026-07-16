#!/usr/bin/env bash
# Exit 0 => skip this deployment. Exit 1 => continue build.
#
# lore-book-web hosts production (lorebookai.com). PR previews belong on lore-keeper.
set -euo pipefail

prod_url="${VERCEL_PROJECT_PRODUCTION_URL:-}"

case "$prod_url" in
  *lore-keeper*)
    exit 1
    ;;
  lorebookai.com|www.lorebookai.com|*lorebookai.com*|*lore-book*)
    case "${VERCEL_GIT_COMMIT_REF:-}" in
      main|stable) exit 1 ;;
      *) exit 0 ;;
    esac
    ;;
esac

# Unknown project: build (do not break other Vercel projects)
exit 1
