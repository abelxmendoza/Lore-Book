#!/bin/bash
# Run essence profile migration
# Usage: ./scripts/run-essence-migration.sh

echo "Running essence_profiles migration..."
echo ""
echo "Please run this SQL in your Supabase SQL Editor:"
echo ""
cat migrations/20250121_essence_profile.sql
echo ""
echo ""
echo "Or if you have psql configured:"
echo "psql \$DATABASE_URL -f migrations/20250121_essence_profile.sql"

