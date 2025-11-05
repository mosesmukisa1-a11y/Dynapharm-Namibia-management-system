#!/bin/bash

# Railway Database Setup Script
# This script helps you initialize your Railway PostgreSQL database

set -e

echo "🚀 Railway PostgreSQL Database Setup"
echo "======================================"
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ psql is not installed"
    echo ""
    echo "Install PostgreSQL client:"
    echo "  macOS: brew install postgresql"
    echo "  Linux: sudo apt-get install postgresql-client"
    exit 1
fi

echo "✅ psql found: $(psql --version)"
echo ""

# Check if DATABASE_URL is already set
if [ -z "$DATABASE_URL" ]; then
    echo "📋 DATABASE_URL not found in environment"
    echo ""
    echo "Please provide your Railway PostgreSQL DATABASE_URL:"
    echo "  (You can find this in Railway → PostgreSQL service → Variables tab)"
    echo ""
    read -p "Enter DATABASE_URL: " RAILWAY_DATABASE_URL
    
    if [ -z "$RAILWAY_DATABASE_URL" ]; then
        echo "❌ DATABASE_URL is required"
        exit 1
    fi
    
    export DATABASE_URL="$RAILWAY_DATABASE_URL"
    echo ""
fi

echo "📡 Testing database connection..."
if psql "$DATABASE_URL" -c "SELECT version();" > /dev/null 2>&1; then
    echo "✅ Connected to database successfully!"
    echo ""
else
    echo "❌ Failed to connect to database"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check if DATABASE_URL is correct"
    echo "  2. Verify Railway PostgreSQL service is running"
    echo "  3. Check your network connection"
    exit 1
fi

# Get project root (script location)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"

SCHEMA_FILE="$PROJECT_ROOT/backend/db_schema.sql"
ENHANCEMENTS_FILE="$PROJECT_ROOT/backend/db_enhancements.sql"

# Check if schema files exist
if [ ! -f "$SCHEMA_FILE" ]; then
    echo "❌ Schema file not found: $SCHEMA_FILE"
    exit 1
fi

if [ ! -f "$ENHANCEMENTS_FILE" ]; then
    echo "❌ Enhancements file not found: $ENHANCEMENTS_FILE"
    exit 1
fi

echo "📄 Step 1: Running database schema..."
echo "   File: $SCHEMA_FILE"
psql "$DATABASE_URL" -f "$SCHEMA_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Schema applied successfully"
else
    echo "❌ Failed to apply schema"
    exit 1
fi

echo ""
echo "🔧 Step 2: Applying database enhancements..."
echo "   File: $ENHANCEMENTS_FILE"
psql "$DATABASE_URL" -f "$ENHANCEMENTS_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Enhancements applied successfully"
else
    echo "⚠️  Some enhancements may have failed (this is OK if already applied)"
fi

echo ""
echo "🔍 Step 3: Verifying setup..."

# Count tables
TABLE_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)

echo "   Found $TABLE_COUNT tables"

# Check for sync_log (indicates enhancements)
SYNC_LOG_EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sync_log');" | xargs)

if [ "$SYNC_LOG_EXISTS" = "t" ]; then
    echo "   ✅ sync_log table exists (enhancements applied)"
else
    echo "   ⚠️  sync_log table not found"
fi

# Check for triggers
TRIGGER_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_trigger WHERE tgname LIKE '%_notify';" | xargs)
echo "   Found $TRIGGER_COUNT realtime triggers"

echo ""
echo "✅ Database setup complete!"
echo ""
echo "📝 Summary:"
echo "   Database: Connected"
echo "   Tables: $TABLE_COUNT"
echo "   Realtime triggers: $TRIGGER_COUNT"
echo ""
echo "🔗 Next steps:"
echo "   1. Save your DATABASE_URL (you'll need it for Vercel)"
echo "   2. Deploy Realtime Gateway to Railway"
echo "   3. Deploy to Vercel with DATABASE_URL environment variable"
echo ""
echo "📋 Your DATABASE_URL (save this!):"
echo "   $DATABASE_URL"
echo ""
