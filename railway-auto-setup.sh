#!/bin/bash

# Railway Automated Setup Script
# Uses Railway CLI to set up PostgreSQL and Realtime Gateway

set -e

RAILWAY_TOKEN="738f0f4b-210a-4461-bccf-547e73a0023a"
PROJECT_NAME="dynapharm-production"

echo "🚂 Railway Automated Setup"
echo "=========================="
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
    echo "✅ Railway CLI installed"
else
    echo "✅ Railway CLI found: $(railway --version)"
fi

echo ""

# Login with token
echo "🔐 Logging in to Railway..."
echo "$RAILWAY_TOKEN" | railway login --token

if [ $? -ne 0 ]; then
    echo "⚠️  Token login failed. Trying interactive login..."
    railway login
fi

echo "✅ Logged in to Railway"
echo ""

# Check if project exists, create if not
echo "📋 Setting up project..."
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3

# Link to existing project or create new
if railway link 2>/dev/null; then
    echo "✅ Linked to existing Railway project"
else
    echo "Creating new Railway project: $PROJECT_NAME"
    railway init --name "$PROJECT_NAME"
    echo "✅ Project created"
fi

echo ""

# Check for PostgreSQL service
echo "🗄️  Checking for PostgreSQL service..."
PG_SERVICE=$(railway service list 2>/dev/null | grep -i postgres || echo "")

if [ -z "$PG_SERVICE" ]; then
    echo "Creating PostgreSQL database..."
    echo "⚠️  Note: Railway CLI doesn't support creating databases directly."
    echo "   Please create PostgreSQL via Railway web interface:"
    echo "   1. Go to https://railway.app"
    echo "   2. Open your project"
    echo "   3. Click '+ New' → Database → Add PostgreSQL"
    echo "   4. Then run this script again"
    echo ""
    read -p "Have you created PostgreSQL? (y/n): " pg_created
    
    if [ "$pg_created" != "y" ]; then
        echo "❌ Please create PostgreSQL first, then run this script again"
        exit 1
    fi
fi

echo ""
echo "📡 Getting DATABASE_URL from Railway..."
export DATABASE_URL=$(railway variables --service PostgreSQL | grep DATABASE_URL | cut -d'=' -f2- | tr -d ' ')

if [ -z "$DATABASE_URL" ]; then
    echo "❌ Could not get DATABASE_URL automatically"
    echo ""
    echo "Please get it manually:"
    echo "  1. Go to Railway → Your Project → PostgreSQL service"
    echo "  2. Go to Variables tab"
    echo "  3. Copy DATABASE_URL value"
    echo ""
    read -p "Enter Railway DATABASE_URL: " DATABASE_URL
    export DATABASE_URL
fi

echo "✅ DATABASE_URL: ${DATABASE_URL:0:50}..."
echo ""

# Initialize database schema
echo "📄 Initializing database schema..."
psql "$DATABASE_URL" -f backend/db_schema.sql

if [ $? -eq 0 ]; then
    echo "✅ Schema applied successfully"
else
    echo "❌ Failed to apply schema"
    exit 1
fi

echo ""

echo "🔧 Applying database enhancements..."
psql "$DATABASE_URL" -f backend/db_enhancements.sql

if [ $? -eq 0 ]; then
    echo "✅ Enhancements applied successfully"
else
    echo "⚠️  Some enhancements may have failed (OK if already applied)"
fi

echo ""

# Verify setup
echo "🔍 Verifying setup..."
TABLE_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)
echo "   Found $TABLE_COUNT tables"

SYNC_LOG_EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sync_log');" | xargs)
if [ "$SYNC_LOG_EXISTS" = "t" ]; then
    echo "   ✅ sync_log table exists"
fi

echo ""
echo "✅ Database setup complete!"
echo ""

# Check for Realtime Gateway service
echo "🌐 Checking Realtime Gateway service..."
GATEWAY_SERVICE=$(railway service list 2>/dev/null | grep -i gateway || echo "")

if [ -z "$GATEWAY_SERVICE" ]; then
    echo "📦 Setting up Realtime Gateway..."
    echo ""
    echo "To deploy Realtime Gateway:"
    echo "  1. In Railway web interface, click '+ New' → GitHub Repo"
    echo "  2. Select your repository"
    echo "  3. Click the new service → Settings"
    echo "  4. Set Root Directory: realtime-gateway"
    echo "  5. Go to Variables → Add DATABASE_URL from PostgreSQL"
    echo "  6. Wait for deployment, then generate domain"
    echo ""
    read -p "Have you deployed Realtime Gateway? (y/n): " gateway_deployed
    
    if [ "$gateway_deployed" = "y" ]; then
        read -p "Enter Realtime Gateway URL: " GATEWAY_URL
        echo ""
        echo "✅ Realtime Gateway URL: $GATEWAY_URL"
    else
        GATEWAY_URL=""
    fi
else
    echo "✅ Realtime Gateway service found"
    GATEWAY_URL=$(railway domain --service RealtimeGateway 2>/dev/null || echo "")
fi

echo ""
echo "========================================"
echo "✅ Railway Setup Complete!"
echo "========================================"
echo ""
echo "📝 Configuration Summary:"
echo ""
echo "DATABASE_URL:"
echo "  $DATABASE_URL"
echo ""

if [ ! -z "$GATEWAY_URL" ]; then
    echo "REALTIME_GATEWAY_URL:"
    echo "  $GATEWAY_URL"
    echo ""
fi

echo "🔗 Next Steps:"
echo "  1. Save these URLs for Vercel configuration"
echo "  2. Deploy to Vercel (see RAILWAY_VERCEL_DEPLOYMENT.md)"
echo "  3. Add these as environment variables in Vercel"
echo ""
