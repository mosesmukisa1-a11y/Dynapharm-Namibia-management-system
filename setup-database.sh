#!/bin/bash

# Dynapharm PostgreSQL Database Setup Script
# This script sets up the database schema and required tables

set -e

echo "🚀 Dynapharm PostgreSQL Database Setup"
echo "========================================"
echo ""

# Check if DATABASE_URL is set (cloud) or use local defaults
if [ -z "$DATABASE_URL" ]; then
    echo "ℹ️  DATABASE_URL not set, using local PostgreSQL defaults"
    echo ""
    
    # Check if PostgreSQL is running
    if ! pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
        echo "❌ PostgreSQL server is not running"
        echo ""
        echo "To start PostgreSQL on macOS:"
        echo "  brew services start postgresql@15"
        echo "  # or"
        echo "  pg_ctl -D /opt/homebrew/var/postgresql@15 start"
        echo ""
        exit 1
    fi
    
    # Get current user
    DB_USER=$(whoami)
    DB_NAME="dynapharm"
    DB_HOST="localhost"
    DB_PORT="5432"
    
    echo "📋 Local Database Configuration:"
    echo "   Host: $DB_HOST"
    echo "   Port: $DB_PORT"
    echo "   Database: $DB_NAME"
    echo "   User: $DB_USER"
    echo ""
    
    # Create database if it doesn't exist
    echo "📦 Creating database '$DB_NAME' if it doesn't exist..."
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME"
    
    echo "✅ Database ready"
    echo ""
    
    # Set connection string for psql
    CONNECTION_STRING="postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
else
    echo "☁️  Using cloud database from DATABASE_URL"
    echo ""
    CONNECTION_STRING="$DATABASE_URL"
fi

# Check if schema file exists
SCHEMA_FILE="backend/db_schema.sql"
if [ ! -f "$SCHEMA_FILE" ]; then
    echo "❌ Schema file not found: $SCHEMA_FILE"
    exit 1
fi

# Run schema
echo "📄 Running database schema..."
psql "$CONNECTION_STRING" -f "$SCHEMA_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Schema applied successfully"
else
    echo "❌ Failed to apply schema"
    exit 1
fi

# Run enhancements (versioning, triggers, etc.)
ENHANCEMENTS_FILE="backend/db_enhancements.sql"
if [ -f "$ENHANCEMENTS_FILE" ]; then
    echo ""
    echo "🔧 Applying database enhancements..."
    psql "$CONNECTION_STRING" -f "$ENHANCEMENTS_FILE"
    
    if [ $? -eq 0 ]; then
        echo "✅ Enhancements applied successfully"
    else
        echo "⚠️  Some enhancements may have failed (this is OK if already applied)"
    fi
fi

echo ""
echo "✅ Database setup complete!"
echo ""
echo "📝 Connection details saved to: backend/.env.example"
echo ""
echo "🔗 To connect:"
if [ -z "$DATABASE_URL" ]; then
    echo "   psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
    echo ""
    echo "   Or set in your environment:"
    echo "   export DATABASE_URL='postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME'"
else
    echo "   Your DATABASE_URL is already configured"
fi
echo ""
