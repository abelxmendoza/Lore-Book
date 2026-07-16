#!/usr/bin/env bash
# Skip dependency install for lore-book-web non-production deploys (PR noise).
set -euo pipefail

prod_url="${VERCEL_PROJECT_PRODUCTION_URL:-}"

case "$prod_url" in
  *lore-keeper*)
    ;;
  lorebookai.com|www.lorebookai.com|*lorebookai.com*|*lore-book*)
    if [ "${VERCEL_ENV:-}" != "production" ]; then
      echo "Skipping install for lore-book-web ${VERCEL_ENV:-unknown} deploy (prod_url=${prod_url})"
      exit 0
    fi
    ;;
esac

rm -rf node_modules
npm install --legacy-peer-deps --include=dev
