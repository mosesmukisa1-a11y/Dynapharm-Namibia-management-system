#!/bin/bash

# Railway Quick Setup Helper Script
# This script helps you set up Railway database and gateway

echo "🚂 Railway Setup Helper"
echo "======================"
echo ""

echo "This script will help you:"
echo "  1. Set up Railway PostgreSQL"
echo "  2. Initialize database schema"
echo "  3. Configure Realtime Gateway"
echo ""
echo "You'll need:"
echo "  - Railway account (https://railway.app)"
echo "  - Your Railway DATABASE_URL"
echo ""

read -p "Do you have a Railway DATABASE_URL ready? (y/n): " has_url

if [ "$has_url" != "y" ]; then
    echo ""
    echo "📋 Step 1: Create Railway PostgreSQL"
    echo "  1. Go to https://railway.app"
    echo "  2. Create new project or select existing"
    echo "  3. Click '+ New' → Database → Add PostgreSQL"
    echo "  4. Wait for provisioning"
    echo "  5. Click PostgreSQL service → Variables tab"
    echo "  6. Copy DATABASE_URL"
    echo ""
    read -p "Press Enter when you have the DATABASE_URL..."
    echo ""
fi

read -p "Enter your Railway DATABASE_URL: " RAILWAY_DATABASE_URL

if [ -z "$RAILWAY_DATABASE_URL" ]; then
    echo "❌ DATABASE_URL is required"
    exit 1
fi

export DATABASE_URL="$RAILWAY_DATABASE_URL"

echo ""
echo "📡 Testing connection to Railway..."
if psql "$DATABASE_URL" -c "SELECT version();" > /dev/null 2>&1; then
    echo "✅ Connected successfully!"
else
    echo "❌ Connection failed"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check if DATABASE_URL is correct"
    echo "  2. Verify Railway PostgreSQL is running"
    echo "  3. Try again"
    exit 1
fi

echo ""
echo "📄 Initializing database schema..."
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3

echo "  Running db_schema.sql..."
psql "$DATABASE_URL" -f backend/db_schema.sql

if [ $? -eq 0 ]; then
    echo "  ✅ Schema applied"
else
    echo "  ❌ Schema failed"
    exit 1
fi

echo ""
echo "  Running db_enhancements.sql..."
psql "$DATABASE_URL" -f backend/db_enhancements.sql

if [ $? -eq 0 ]; then
    echo "  ✅ Enhancements applied"
else
    echo "  ⚠️  Some enhancements may have failed (OK if already applied)"
fi

echo ""
echo "🔍 Verifying setup..."
TABLE_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)
echo "  Found $TABLE_COUNT tables"

echo ""
echo "✅ Railway database setup complete!"
echo ""
echo "📝 Your Railway DATABASE_URL (save this!):"
echo "   $DATABASE_URL"
echo ""
echo "🔗 Next Steps:"
echo "  1. Deploy Realtime Gateway to Railway"
echo "  2. Get Realtime Gateway URL"
echo "  3. Deploy to Vercel with both URLs"
echo ""
