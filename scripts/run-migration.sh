#!/bin/bash

# Migration Runner Script
# Easily run database migrations for Lore Keeper

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load .env file if it exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Get database connection details
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

# Extract project ref from URL
if [ -n "$SUPABASE_URL" ]; then
    PROJECT_REF=$(echo "$SUPABASE_URL" | sed -E 's|https?://([^.]+)\..*|\1|')
else
    PROJECT_REF="jawzxiiwfagliloxnnkc"
fi

# Function to show usage
show_usage() {
    echo "Usage: $0 [migration_file.sql]"
    echo ""
    echo "Examples:"
    echo "  $0 migrations/20250120_terms_acceptance.sql"
    echo "  $0 migrations/000_setup_all_tables.sql"
    echo ""
    echo "If no file is provided, you'll be prompted to select one."
    exit 1
}

# Function to get database password
get_password() {
    echo -e "${YELLOW}📝 Database Password Required${NC}"
    echo ""
    echo "To get your database password:"
    echo "1. Go to: https://supabase.com/dashboard/project/${PROJECT_REF}/settings/database"
    echo "2. Find 'Database password' or 'Connection string'"
    echo "3. Copy the password"
    echo ""
    read -sp "Enter database password: " DB_PASSWORD
    echo ""
    
    if [ -z "$DB_PASSWORD" ]; then
        echo -e "${RED}❌ Password cannot be empty${NC}"
        exit 1
    fi
}

# Function to run migration
run_migration() {
    local migration_file=$1
    
    if [ ! -f "$migration_file" ]; then
        echo -e "${RED}❌ Migration file not found: $migration_file${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}🚀 Running migration: $migration_file${NC}"
    echo ""
    
    # Check if custom connection string is set
    if [ -n "$SUPABASE_CONNECTION_STRING" ]; then
        CONNECTION_STRING="$SUPABASE_CONNECTION_STRING"
        echo -e "${YELLOW}Using custom connection string from environment...${NC}"
    else
        # Build connection string based on Supabase documentation
        # Try formats in order:
        # 1. Direct connection (IPv6, port 5432) - best for psql
        # 2. Pooler session mode (IPv4/IPv6, port 5432) - if direct fails
        # 3. Pooler transaction mode (port 6543) - for serverless
        
        echo -e "${YELLOW}Connecting to database...${NC}"
        
        # Format 1: Direct connection (recommended for psql)
        # Format: postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
        CONNECTION_STRING="postgresql://postgres:${DB_PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres"
        
        # Try Format 2: Pooler session mode (if direct connection fails - supports IPv4)
        # Format: postgres://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
        POOLER_SESSION="postgres://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require"
        
        # Try Format 3: Pooler transaction mode (port 6543)
        POOLER_TRANSACTION="postgres://postgres:${DB_PASSWORD}@db.${PROJECT_REF}.supabase.co:6543/postgres?sslmode=require"
        
        # Try direct connection first
        if psql "$CONNECTION_STRING" -f "$migration_file" 2>/dev/null; then
            echo ""
            echo -e "${GREEN}✅ Migration completed successfully!${NC}"
            exit 0
        fi
        
        # If direct fails, try pooler session mode
        echo -e "${YELLOW}Trying pooler session mode (IPv4/IPv6 support)...${NC}"
        if psql "$POOLER_SESSION" -f "$migration_file" 2>/dev/null; then
            echo ""
            echo -e "${GREEN}✅ Migration completed successfully!${NC}"
            exit 0
        fi
        
        # If that fails, try transaction mode
        echo -e "${YELLOW}Trying pooler transaction mode...${NC}"
        CONNECTION_STRING="$POOLER_TRANSACTION"
    fi
    
    # Run the migration
    if psql "$CONNECTION_STRING" -f "$migration_file"; then
        echo ""
        echo -e "${GREEN}✅ Migration completed successfully!${NC}"
    else
        echo ""
        echo -e "${RED}❌ Migration failed${NC}"
        echo ""
        echo -e "${YELLOW}💡 Tip: Get your exact connection string from Supabase dashboard${NC}"
        echo "   Run: ./scripts/setup-connection-string.sh"
        echo ""
        echo "   Or set it manually:"
        echo "   export SUPABASE_CONNECTION_STRING='postgresql://...'"
        echo "   ./scripts/run-migration.sh $migration_file"
        echo ""
        echo "   Connection string location:"
        echo "   https://supabase.com/dashboard/project/${PROJECT_REF}/settings/database"
        echo "   (Click 'Connect' → Select 'URI' → Copy connection string)"
        exit 1
    fi
}

# Main script
if [ $# -eq 0 ]; then
    # No file provided, show available migrations
    echo -e "${YELLOW}Available migrations:${NC}"
    echo ""
    ls -1 migrations/*.sql 2>/dev/null | nl
    echo ""
    read -p "Enter migration number or path: " selection
    
    # Check if it's a number
    if [[ "$selection" =~ ^[0-9]+$ ]]; then
        migration_file=$(ls -1 migrations/*.sql | sed -n "${selection}p")
        if [ -z "$migration_file" ]; then
            echo -e "${RED}❌ Invalid selection${NC}"
            exit 1
        fi
    else
        migration_file="$selection"
    fi
else
    migration_file=$1
fi

# Get password if not set
if [ -z "$DB_PASSWORD" ]; then
    get_password
fi

# Run the migration
run_migration "$migration_file"

