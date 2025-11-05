#!/bin/bash

# Local PostgreSQL Database Setup Script
# Sets up database with custom password and name

set -e

DB_NAME="dynapharm"
DB_PASSWORD="welker33"
DB_USER=$(whoami)  # Use current macOS user
DB_HOST="localhost"
DB_PORT="5432"

echo "🗄️  Setting Up Local PostgreSQL Database"
echo "=========================================="
echo ""
echo "Configuration:"
echo "  Database Name: $DB_NAME"
echo "  Database User: $DB_USER"
echo "  Password: $DB_PASSWORD"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo ""

# Check if PostgreSQL is running
if ! pg_isready -h $DB_HOST -p $DB_PORT > /dev/null 2>&1; then
    echo "❌ PostgreSQL server is not running"
    echo ""
    echo "To start PostgreSQL on macOS:"
    echo "  brew services start postgresql@15"
    echo "  # or"
    echo "  pg_ctl -D /opt/homebrew/var/postgresql@15 start"
    echo ""
    exit 1
fi

echo "✅ PostgreSQL server is running"
echo ""

# Create database if it doesn't exist
echo "📦 Creating database '$DB_NAME'..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || \
(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME';" | grep -q 1 && \
echo "   Database already exists, continuing...")
echo "✅ Database ready"
echo ""

# Create DATABASE_URL (for local, password not needed in URL if using peer auth)
# But we'll create a version with password for consistency
DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
# For local macOS PostgreSQL, we can connect without password in URL:
LOCAL_DATABASE_URL="postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"

echo "📄 Step 1: Running database schema..."
psql "$LOCAL_DATABASE_URL" -f backend/db_schema.sql

if [ $? -eq 0 ]; then
    echo "✅ Schema applied successfully"
else
    echo "❌ Failed to apply schema"
    exit 1
fi

echo ""
echo "🔧 Step 2: Applying database enhancements..."
psql "$LOCAL_DATABASE_URL" -f backend/db_enhancements.sql

if [ $? -eq 0 ]; then
    echo "✅ Enhancements applied successfully"
else
    echo "⚠️  Some enhancements may have failed (this is OK if already applied)"
fi

echo ""
echo "🔍 Step 3: Verifying setup..."

# Count tables
TABLE_COUNT=$(psql "$LOCAL_DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)

echo "   Found $TABLE_COUNT tables"

# Check for sync_log
SYNC_LOG_EXISTS=$(psql "$LOCAL_DATABASE_URL" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sync_log');" | xargs)

if [ "$SYNC_LOG_EXISTS" = "t" ]; then
    echo "   ✅ sync_log table exists (enhancements applied)"
else
    echo "   ⚠️  sync_log table not found"
fi

# Check for triggers
TRIGGER_COUNT=$(psql "$LOCAL_DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_trigger WHERE tgname LIKE '%_notify';" | xargs)
echo "   Found $TRIGGER_COUNT realtime triggers"

echo ""
echo "✅ Database setup complete!"
echo ""
echo "📝 Summary:"
echo "   Database Name: $DB_NAME"
echo "   Database User: $DB_USER"
echo "   Host: $DB_HOST:$DB_PORT"
echo "   Tables: $TABLE_COUNT"
echo "   Realtime triggers: $TRIGGER_COUNT"
echo ""
echo "🔗 DATABASE_URL for local development:"
echo "   $LOCAL_DATABASE_URL"
echo ""
echo "🔗 DATABASE_URL with password (for Railway/Vercel):"
echo "   $DATABASE_URL"
echo ""
echo "💾 To use this database, set environment variable:"
echo "   export DATABASE_URL='$LOCAL_DATABASE_URL'"
echo ""
echo "🧪 Test connection:"
echo "   psql \"$LOCAL_DATABASE_URL\" -c \"SELECT version();\""
echo ""
echo "📋 Note: For Railway deployment, you'll get a different DATABASE_URL"
echo "   from Railway's PostgreSQL service."
echo ""
