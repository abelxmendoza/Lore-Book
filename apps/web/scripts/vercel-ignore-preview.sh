#!/usr/bin/env bash
# Exit 0 => skip this deployment. Exit 1 => continue build.
#
# lore-book-web hosts production (lorebookai.com). PR previews belong on lore-keeper.
set -euo pipefail

prod_url="${VERCEL_PROJECT_PRODUCTION_URL:-}"

is_prod_web=0
case "$prod_url" in
  lorebookai.com|www.lorebookai.com|*lorebookai.com) is_prod_web=1 ;;
esac

if [ "$is_prod_web" -eq 1 ]; then
  case "${VERCEL_GIT_COMMIT_REF:-}" in
    main|stable) exit 1 ;;
    *) exit 0 ;;
  esac
fi

# lore-keeper / other projects: always build
exit 1
