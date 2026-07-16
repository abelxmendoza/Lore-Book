#!/usr/bin/env bash
# Stub non-lore-keeper preview builds so lore-book-web PR checks stay green.
set -euo pipefail

prod_url="${VERCEL_PROJECT_PRODUCTION_URL:-}"

case "$prod_url" in
  *lore-keeper*)
    ;;
  *)
    if [ "${VERCEL_ENV:-}" != "production" ]; then
      echo "Stub build for non-lore-keeper ${VERCEL_ENV:-unknown} deploy (prod_url=${prod_url})"
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
