#!/usr/bin/env bash
# Skip dependency install for non-lore-keeper preview deploys.
set -euo pipefail

prod_url="${VERCEL_PROJECT_PRODUCTION_URL:-}"

case "$prod_url" in
  *lore-keeper*)
    ;;
  *)
    if [ "${VERCEL_ENV:-}" != "production" ]; then
      echo "Skipping install for non-lore-keeper ${VERCEL_ENV:-unknown} deploy (prod_url=${prod_url})"
      exit 0
    fi
    ;;
esac

rm -rf node_modules
npm install --legacy-peer-deps --include=dev
