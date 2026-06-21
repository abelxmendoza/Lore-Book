#!/bin/bash

# Setup script for local Supabase development
# This keeps all your data on your local machine

set -e

echo "🔒 Setting up Local Supabase for Private Development"
echo "======================================================"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Installing..."
    npm install -g supabase
    echo "✅ Supabase CLI installed"
else
    echo "✅ Supabase CLI found"
fi

# Initialize Supabase if not already initialized
if [ ! -d ".supabase" ]; then
    echo ""
    echo "📦 Initializing Supabase..."
    supabase init
    echo "✅ Supabase initialized"
else
    echo "✅ Supabase already initialized"
fi

# Start Supabase
echo ""
echo "🚀 Starting local Supabase..."
supabase start

echo ""
echo "✅ Local Supabase is running!"
echo ""
echo "📋 Next Steps:"
echo "1. Copy the credentials shown above to your .env file:"
echo "   - SUPABASE_URL=http://localhost:54321"
echo "   - SUPABASE_ANON_KEY=<shown above>"
echo "   - SUPABASE_SERVICE_ROLE_KEY=<shown above>"
echo ""
echo "2. Run migrations:"
echo "   supabase db reset"
echo ""
echo "3. Start the app:"
echo "   npm run dev:server"
echo "   npm run dev:web"
echo ""
echo "🔒 Your data will stay on your local machine!"
echo ""
echo "To stop Supabase: supabase stop"
echo "To reset database: supabase db reset"

