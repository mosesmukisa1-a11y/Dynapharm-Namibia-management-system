#!/bin/bash
# Setup Railway Gateway with Token
set -e

export RAILWAY_TOKEN='465e4489-cf3d-448a-8172-74db8e58e93a'

echo "🚂 Setting up Railway Gateway..."
echo ""

# Navigate to realtime-gateway
cd "$(dirname "$0")/realtime-gateway"

echo "📍 Current directory: $(pwd)"
echo ""

# Check if we can access Railway
echo "🔐 Verifying Railway access..."
if railway whoami &>/dev/null; then
    echo "✅ Connected to Railway"
    railway whoami
else
    echo "❌ Cannot connect. Please run 'railway login --browserless' manually in your terminal"
    echo "   When prompted, paste the token: 465e4489-cf3d-448a-8172-74db8e58e93a"
    exit 1
fi

echo ""

# Link to Railway project
if [ ! -f ".railway/link.json" ]; then
    echo "🔗 Linking to Railway project..."
    railway link
else
    echo "✅ Already linked to Railway project"
fi

echo ""

# Set DATABASE_URL
echo "🔧 Setting DATABASE_URL..."
railway variables set DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway'

echo ""
echo "📋 Current environment variables:"
railway variables

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  IMPORTANT: Manual Step Required"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "You need to set Root Directory in Railway Dashboard:"
echo "1. Go to https://railway.app"
echo "2. Your project → Realtime Gateway service"
echo "3. Settings → Service Settings"
echo "4. Set Root Directory to: realtime-gateway"
echo "5. Set Start Command to: node server.js"
echo "6. Save"
echo ""

read -p "Press Enter after you've set Root Directory in Railway Dashboard..."

echo ""
echo "🚀 Deploying..."
railway up

echo ""
echo "✅ Setup complete! Wait 2-3 minutes, then test:"
echo "   curl https://web-production-40cac.up.railway.app/health"
echo ""

