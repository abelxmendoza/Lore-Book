#!/bin/bash

# Simple migration runner using exact connection string format
# Usage: DB_PASSWORD="your-password" ./scripts/run-migration-simple.sh migrations/filename.sql

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ $# -eq 0 ]; then
    echo -e "${YELLOW}Usage: DB_PASSWORD='your-password' ./scripts/run-migration-simple.sh migrations/filename.sql${NC}"
    echo ""
    echo "Available migrations:"
    ls -1 migrations/*.sql 2>/dev/null | nl
    exit 1
fi

MIGRATION_FILE=$1

if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}❌ File not found: $MIGRATION_FILE${NC}"
    exit 1
fi

if [ -z "$DB_PASSWORD" ]; then
    echo -e "${YELLOW}Enter database password:${NC}"
    read -sp "Password: " DB_PASSWORD
    echo ""
fi

# Use the exact format you provided
CONNECTION_STRING="postgresql://postgres:${DB_PASSWORD}@db.jawzxiiwfagliloxnnkc.supabase.co:5432/postgres"

echo -e "${GREEN}🚀 Running migration: $MIGRATION_FILE${NC}"
echo ""

if psql "$CONNECTION_STRING" -f "$MIGRATION_FILE"; then
    echo ""
    echo -e "${GREEN}✅ Migration completed successfully!${NC}"
else
    echo ""
    echo -e "${RED}❌ Migration failed${NC}"
    echo ""
    echo "If connection fails, you can:"
    echo "1. Use SQL Editor: https://supabase.com/dashboard/project/jawzxiiwfagliloxnnkc/sql/new"
    echo "2. Get exact connection string from dashboard and set:"
    echo "   export SUPABASE_CONNECTION_STRING='your-exact-string'"
    exit 1
fi

