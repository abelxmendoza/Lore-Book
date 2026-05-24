#!/bin/bash
# Phase 1 Migration Runner
# Runs all base + Phase 1 migrations in the correct order with pre/post checks.
#
# Usage:
#   ./scripts/run-phase1-migrations.sh
#
# Requires:
#   - psql installed (brew install libpq)
#   - DB_PASSWORD set, OR SUPABASE_CONNECTION_STRING set in .env
#
# Migration order:
#   1. 000_setup_all_tables.sql              — core schema (journal_entries, chapters, characters, tasks)
#   2. 20250102_conversational_orchestration — chat_sessions, chat_messages
#   3. 20250106_conversation_centered_memory — utterances, extracted_units
#   4. phase1_01_characters_rls.sql          — RLS for characters tables
#   5. phase1_02_embedding_versioning.sql    — embedding model versioning
#   6. phase1_03_entry_ir_consolidation.sql  — consolidation tracking + dead-letter
#   7. phase1_04_conversation_compactions.sql — compaction table + memory_health view

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# Load env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

PROJECT_REF=$(echo "$SUPABASE_URL" | sed -E 's|https?://([^.]+)\..*|\1|')

# ─── Get connection string ────────────────────────────────────────────────────
if [ -z "$SUPABASE_CONNECTION_STRING" ]; then
  if [ -z "$DB_PASSWORD" ]; then
    echo -e "${YELLOW}Database password required.${NC}"
    echo "Get it from: https://supabase.com/dashboard/project/${PROJECT_REF}/settings/database"
    echo ""
    read -sp "DB Password: " DB_PASSWORD
    echo ""
  fi
  CONN="postgresql://postgres:${DB_PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres"
  CONN_POOLER="postgres://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-0-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require"
else
  CONN="$SUPABASE_CONNECTION_STRING"
  CONN_POOLER="$SUPABASE_CONNECTION_STRING"
fi

# Try connection
try_connect() {
  psql "$1" -c "SELECT 1;" > /dev/null 2>&1
}

echo -e "${CYAN}Testing database connection...${NC}"
if try_connect "$CONN"; then
  echo -e "${GREEN}✓ Direct connection OK${NC}"
elif try_connect "$CONN_POOLER"; then
  echo -e "${YELLOW}Direct failed; using pooler${NC}"
  CONN="$CONN_POOLER"
else
  echo -e "${RED}✗ Cannot connect to database. Check password and try again.${NC}"
  exit 1
fi

# ─── Pre-flight checks ────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}Running pre-flight checks...${NC}"

PGVECTOR=$(psql "$CONN" -tAc "SELECT COUNT(*) FROM pg_extension WHERE extname = 'vector';" 2>/dev/null)
if [ "$PGVECTOR" = "1" ]; then
  echo -e "${GREEN}✓ pgvector extension active${NC}"
else
  echo -e "${RED}✗ pgvector not installed. Run: CREATE EXTENSION IF NOT EXISTS vector;${NC}"
  exit 1
fi

AUTH=$(psql "$CONN" -tAc "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = 'auth';" 2>/dev/null)
if [ "$AUTH" = "1" ]; then
  echo -e "${GREEN}✓ auth schema present${NC}"
else
  echo -e "${RED}✗ auth schema missing — this must be a Supabase project${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Pre-flight checks passed${NC}"

# ─── Run migrations ───────────────────────────────────────────────────────────
MIGRATIONS=(
  "migrations/000_setup_all_tables.sql"
  "migrations/20250102_conversational_orchestration.sql"
  "migrations/20250106_conversation_centered_memory.sql"
  "migrations/phase1_01_characters_rls.sql"
  "migrations/phase1_02_embedding_versioning.sql"
  "migrations/phase1_03_entry_ir_consolidation.sql"
  "migrations/phase1_04_conversation_compactions.sql"
)

echo ""
echo -e "${CYAN}Running ${#MIGRATIONS[@]} migrations...${NC}"
echo ""

for f in "${MIGRATIONS[@]}"; do
  if [ ! -f "$f" ]; then
    echo -e "${RED}  ✗ Not found: $f${NC}"
    exit 1
  fi
  echo -e "  → $f"
  if psql "$CONN" -f "$f" > /dev/null 2>&1; then
    echo -e "    ${GREEN}✓ OK${NC}"
  else
    # Run again with output visible so user can see the error
    echo -e "    ${YELLOW}⚠ Errors (may already be applied):${NC}"
    psql "$CONN" -f "$f" 2>&1 | grep -v "^$" | head -10 || true
  fi
done

# ─── Post-migration validation ────────────────────────────────────────────────
echo ""
echo -e "${CYAN}Post-migration validation...${NC}"

check_table() {
  local t=$1
  local exists=$(psql "$CONN" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='$t';" 2>/dev/null)
  if [ "$exists" = "1" ]; then
    echo -e "  ${GREEN}✓ table: $t${NC}"
  else
    echo -e "  ${RED}✗ MISSING table: $t${NC}"
  fi
}

check_index() {
  local i=$1
  local exists=$(psql "$CONN" -tAc "SELECT COUNT(*) FROM pg_indexes WHERE indexname='$i';" 2>/dev/null)
  if [ "$exists" = "1" ]; then
    echo -e "  ${GREEN}✓ index: $i${NC}"
  else
    echo -e "  ${YELLOW}⚠ missing index: $i${NC}"
  fi
}

check_function() {
  local f=$1
  local exists=$(psql "$CONN" -tAc "SELECT COUNT(*) FROM pg_proc WHERE proname='$f';" 2>/dev/null)
  if [ "$exists" = "1" ]; then
    echo -e "  ${GREEN}✓ function: $f${NC}"
  else
    echo -e "  ${RED}✗ MISSING function: $f${NC}"
  fi
}

check_rls() {
  local t=$1
  local enabled=$(psql "$CONN" -tAc "SELECT rowsecurity FROM pg_tables WHERE tablename='$t' AND schemaname='public';" 2>/dev/null | tr -d ' ')
  if [ "$enabled" = "t" ]; then
    echo -e "  ${GREEN}✓ RLS: $t${NC}"
  else
    echo -e "  ${RED}✗ RLS NOT ENABLED: $t${NC}"
  fi
}

echo ""
echo "Core tables:"
check_table "journal_entries"
check_table "chapters"
check_table "characters"
check_table "tasks"
check_table "chat_sessions"
check_table "chat_messages"
check_table "utterances"
check_table "extracted_units"
check_table "entry_ir"

echo ""
echo "Phase 1 tables:"
check_table "embedding_model_registry"
check_table "ingestion_dead_letter"
check_table "conversation_compactions"

echo ""
echo "Critical indexes:"
check_index "idx_entry_ir_pending_consolidation"
check_index "idx_characters_stale_embedding"
check_index "idx_compactions_session"

echo ""
echo "Functions:"
check_function "match_journal_entries"

echo ""
echo "RLS policies:"
check_rls "characters"
check_rls "character_relationships"
check_rls "utterances"
check_rls "extracted_units"
check_rls "conversation_compactions"
check_rls "ingestion_dead_letter"

echo ""
echo -e "${GREEN}Phase 1 migration complete.${NC}"
echo "Restart the server to pick up the new schema: npm run dev:server"
