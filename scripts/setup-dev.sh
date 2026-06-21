#!/bin/bash

# Quick setup script for Lore Keeper development
set -e

echo "🚀 Lore Keeper Development Setup"
echo "=================================="
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'EOF'
# Supabase Configuration (update after running supabase start)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# OpenAI Configuration (get from https://platform.openai.com/api-keys)
OPENAI_API_KEY=sk-your-key-here

# Server Configuration
PORT=4000
NODE_ENV=development
LOG_LEVEL=info
EOF
    echo "✅ Created .env file - please update with your credentials"
else
    echo "✅ .env file already exists"
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install --legacy-peer-deps

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo ""
    echo "⚠️  Supabase CLI not found. Installing..."
    npm install -g supabase
fi

# Initialize Supabase if needed
if [ ! -d ".supabase" ]; then
    echo ""
    echo "📦 Initializing Supabase..."
    supabase init
fi

# Start Supabase
echo ""
echo "🚀 Starting Supabase..."
supabase start

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Copy the Supabase credentials shown above to your .env file"
echo "2. Add your OpenAI API key to .env"
echo "3. Run: npm run dev:server (in one terminal)"
echo "4. Run: npm run dev:web (in another terminal)"
echo "5. Open: http://localhost:5173"
echo ""
echo "📚 For more help, see QUICK_START.md"

