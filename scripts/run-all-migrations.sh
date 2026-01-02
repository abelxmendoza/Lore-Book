#!/bin/bash

# Run All Migrations Script
# Runs all migration files in order

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Running all migrations...${NC}"
echo ""

# Use the run-migration script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Get password once
echo -e "${YELLOW}📝 Database Password Required${NC}"
echo ""
read -sp "Enter database password: " DB_PASSWORD
echo ""

if [ -z "$DB_PASSWORD" ]; then
    echo -e "${RED}❌ Password cannot be empty${NC}"
    exit 1
fi

export DB_PASSWORD

# Run migrations in order
MIGRATIONS=(
    "migrations/000_setup_all_tables.sql"
    "migrations/20250101_chapters_table.sql"
    "migrations/20250115_subscriptions.sql"
    "migrations/20250120_terms_acceptance.sql"
    "migrations/20250120_timeline_hierarchy.sql"
    "migrations/20250210_embeddings.sql"
    "migrations/20250305_task_engine.sql"
    "migrations/20250313_character_knowledge_base.sql"
    "migrations/20250325_task_timeline_links.sql"
    "migrations/202504_security_rls_hardening.sql"
    "migrations/20250515_autopilot_alerts.sql"
    "migrations/20250601_agent_logs.sql"
    "migrations/20250602_memoir_outlines.sql"
    "migrations/20250603_original_documents.sql"
)

SUCCESS=0
FAILED=0

for migration in "${MIGRATIONS[@]}"; do
    if [ -f "$migration" ]; then
        echo -e "${GREEN}📝 Running: $migration${NC}"
        if "$SCRIPT_DIR/run-migration.sh" "$migration" > /dev/null 2>&1; then
            ((SUCCESS++))
        else
            echo -e "${YELLOW}⚠️  Skipped (may already exist): $migration${NC}"
            ((FAILED++))
        fi
    else
        echo -e "${YELLOW}⚠️  File not found: $migration${NC}"
    fi
done

echo ""
echo -e "${GREEN}✅ Completed: $SUCCESS migrations${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Skipped: $FAILED migrations (may already exist)${NC}"
fi

