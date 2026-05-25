#!/bin/bash
# Apply all migrations to the cloud Supabase database.
# Uses psql with ON_ERROR_STOP=off so it continues past dependency errors
# and applies as many tables as possible in one pass.
# Run from project root: ./scripts/push-migrations.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

DB_URL="postgres://postgres:qzT8bZnClp5UtEb5@db.mwtyckyguduigflpnqss.supabase.co:5432/postgres?sslmode=require"
MIGRATION_DIR="supabase/migrations"

echo "🚀 Applying migrations to cloud Supabase..."
echo "   DB: db.mwtyckyguduigflpnqss.supabase.co"
echo ""

pass=1
for f in $(ls "$MIGRATION_DIR"/*.sql | sort); do
  name=$(basename "$f")
  printf "  [%d] %-70s" "$pass" "$name"
  result=$(PGPASSWORD=qzT8bZnClp5UtEb5 psql "$DB_URL" \
    -v ON_ERROR_STOP=off \
    -q \
    -f "$f" 2>&1)
  if echo "$result" | grep -q "^ERROR"; then
    err=$(echo "$result" | grep "^ERROR" | head -1 | cut -c1-80)
    echo "⚠  $err"
  else
    echo "✓"
  fi
  pass=$((pass+1))
done

echo ""
echo "✅ Done. Check above for any ⚠ warnings."
echo "   Most 'already exists' notices are safe to ignore."
