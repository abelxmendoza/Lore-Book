# Migration Guide - Easy CLI Setup

## Quick Start

### Option 1: Use SQL Editor (Easiest - Already Working!)
1. Go to: https://supabase.com/dashboard/project/jawzxiiwfagliloxnnkc/sql/new
2. Copy/paste SQL from migration file
3. Click "Run"

### Option 2: Use CLI Script

**First, get your connection string:**
```bash
./scripts/setup-connection-string.sh
```

Then set it:
```bash
export SUPABASE_CONNECTION_STRING='postgresql://postgres:password@db.jawzxiiwfagliloxnnkc.supabase.co:5432/postgres'
```

**Run a Single Migration:**
```bash
./scripts/run-migration.sh migrations/20250120_terms_acceptance.sql
```

Or just run the script without arguments to see a list:

```bash
./scripts/run-migration.sh
```

### Run All Migrations

```bash
./scripts/run-all-migrations.sh
```

## How It Works

1. **First time**: You'll be prompted for your database password
2. **The script** connects to your Supabase database using `psql`
3. **Runs the SQL** from the migration file
4. **Shows success/failure** messages

## Getting Your Database Password

1. Go to: https://supabase.com/dashboard/project/jawzxiiwfagliloxnnkc/settings/database
2. Find "Database password" section
3. Click "Reveal" or "Reset password" if needed
4. Copy the password

## Available Migrations

- `000_setup_all_tables.sql` - Creates all main tables (run this first if starting fresh)
- `20250120_terms_acceptance.sql` - Terms of Service tracking (already done!)
- `20250115_subscriptions.sql` - Subscription system tables
- `20250120_timeline_hierarchy.sql` - Timeline hierarchy tables
- And more...

## Troubleshooting

### "psql: command not found"
Install PostgreSQL client:
```bash
brew install postgresql
```

### "Password authentication failed"
- Make sure you're using the correct password from Supabase dashboard
- Check that your IP is allowed (Supabase free tier allows all IPs)

### "Table already exists"
This is fine! The migrations use `CREATE TABLE IF NOT EXISTS`, so they're safe to run multiple times.

## Alternative: Manual Method

If you prefer the SQL Editor:
1. Go to: https://supabase.com/dashboard/project/jawzxiiwfagliloxnnkc/sql/new
2. Copy/paste the SQL from the migration file
3. Click "Run"

The CLI method is faster for future migrations! 🚀

