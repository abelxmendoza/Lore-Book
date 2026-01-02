#!/bin/bash

# Helper script to get the correct connection string from Supabase dashboard

echo "📋 To get your exact connection string:"
echo ""
echo "1. Go to: https://supabase.com/dashboard/project/jawzxiiwfagliloxnnkc/settings/database"
echo ""
echo "2. Scroll to 'Connection string' section"
echo ""
echo "3. Select 'URI' format"
echo ""
echo "4. Copy the connection string (it will look like):"
echo "   postgresql://postgres.[PROJECT_REF]:[YOUR_PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"
echo ""
echo "5. Use it like this:"
echo "   psql 'your-connection-string-here' -f migrations/20250120_terms_acceptance.sql"
echo ""
echo "Or update scripts/run-migration.sh with the correct format from your dashboard."

