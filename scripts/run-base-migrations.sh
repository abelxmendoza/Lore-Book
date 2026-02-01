#!/bin/bash
# Run the minimal migrations needed for the app to work (journal_entries, chapters, people_places, tasks, chat_sessions, etc.).
# You need your Supabase *database* password (Project Settings → Database), not the anon/service key.
#
# Requires: psql (PostgreSQL client). If missing, use: npm run migrate:base

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Prompt for database password once if not set (so run-migration.sh doesn't prompt per file)
if [ -z "$DB_PASSWORD" ] && [ -z "$SUPABASE_CONNECTION_STRING" ]; then
  echo "Supabase database password (Project Settings → Database):"
  read -sp "Password: " DB_PASSWORD
  echo ""
  export DB_PASSWORD
fi

BASE_MIGRATIONS=(
  "migrations/000_setup_all_tables.sql"
  "migrations/20250102_conversational_orchestration.sql"
)

echo "Running ${#BASE_MIGRATIONS[@]} base migration(s)..."
for f in "${BASE_MIGRATIONS[@]}"; do
  if [ -f "$f" ]; then
    echo "  → $f"
    "$SCRIPT_DIR/run-migration.sh" "$f" || { echo "  ⚠ Failed (may already be applied). Continuing."; }
  else
    echo "  ⚠ Not found: $f"
  fi
done
echo "Done. If you saw errors, some objects may already exist (safe to ignore)."
