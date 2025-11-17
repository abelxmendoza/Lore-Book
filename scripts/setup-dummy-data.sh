#!/bin/bash

# Setup Dummy Data Script for Lore Keeper
# This script creates all tables and seeds dummy data for development

set -e

echo "🚀 Setting up Lore Keeper database with dummy data..."
echo ""

# Check if Supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "   brew install supabase/tap/supabase"
    exit 1
fi

# Check if we're in a Supabase project
if [ ! -f "supabase/config.toml" ]; then
    echo "⚠️  No Supabase project found. Initializing..."
    supabase init
fi

# Check if Supabase is running
if ! supabase status &> /dev/null; then
    echo "⚠️  Supabase is not running. Starting..."
    supabase start
fi

# Get the database URL
DB_URL=$(supabase status | grep "DB URL" | awk '{print $3}')

if [ -z "$DB_URL" ]; then
    echo "❌ Could not get database URL. Is Supabase running?"
    exit 1
fi

echo "📊 Database URL: $DB_URL"
echo ""

# Run migrations
echo "📝 Creating tables..."
psql "$DB_URL" -f migrations/000_setup_all_tables.sql

if [ $? -eq 0 ]; then
    echo "✅ Tables created successfully"
else
    echo "❌ Failed to create tables"
    exit 1
fi

echo ""

# Seed dummy data
echo "🌱 Seeding dummy data..."
psql "$DB_URL" -f migrations/001_seed_dummy_data.sql

if [ $? -eq 0 ]; then
    echo "✅ Dummy data seeded successfully"
else
    echo "❌ Failed to seed dummy data"
    exit 1
fi

echo ""
echo "✨ Setup complete! Your database is ready with dummy data."
echo ""
echo "📋 Summary:"
echo "   - Tables created"
echo "   - 3 chapters"
echo "   - 10 characters"
echo "   - 10+ journal entries"
echo "   - 5 tasks"
echo "   - Character relationships and memories"
echo ""
echo "🔗 You can now use the app with dev-user-id as your user ID"

