#!/usr/bin/env bash
# Emit a tiny static stub for lore-book-web non-production deploys so the
# GitHub check is green without competing with lore-keeper PR previews.
set -euo pipefail

prod_url="${VERCEL_PROJECT_PRODUCTION_URL:-}"
case "$prod_url" in
  lorebookai.com|www.lorebookai.com|*lorebookai.com)
    if [ "${VERCEL_ENV:-}" != "production" ]; then
      echo "Stub build for lore-book-web ${VERCEL_ENV:-unknown} deploy"
      rm -rf dist
      mkdir -p dist
      cat > dist/index.html <<'HTML'
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"/><title>LoreBook</title></head>
  <body><p>Preview builds for this production project are skipped. Use the lore-keeper preview.</p></body>
</html>
HTML
      exit 0
    fi
    ;;
esac

rm -rf dist
npm run build
