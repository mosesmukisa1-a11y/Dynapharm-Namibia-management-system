#!/bin/bash
# Deploy Railway Gateway from the correct directory
# This ensures Railway uses realtime-gateway as the root

set -e

echo "🚂 Deploying Railway Gateway from realtime-gateway directory..."
echo ""

# Navigate to realtime-gateway directory
cd "$(dirname "$0")/realtime-gateway"

echo "📍 Current directory: $(pwd)"
echo ""

# Verify we're in the right place
if [ ! -f "server.js" ]; then
    echo "❌ Error: server.js not found. Are you in the right directory?"
    exit 1
fi

echo "✅ Found server.js - ready to deploy"
echo ""

# Check Railway login
if ! railway whoami &>/dev/null; then
    echo "⚠️  Not logged in to Railway. Please login first:"
    echo "   railway login --browserless"
    exit 1
fi

echo "✅ Logged in to Railway"
railway whoami
echo ""

# Link to service if not already linked
if [ ! -f ".railway/link.json" ]; then
    echo "🔗 Linking to Railway service..."
    railway link
    echo ""
else
    echo "✅ Already linked to Railway service"
    railway status
    echo ""
fi

# Verify DATABASE_URL is set
echo "📋 Checking environment variables..."
if railway variables --json | grep -q '"DATABASE_URL":""'; then
    echo "⚠️  DATABASE_URL not set. Setting it now..."
    railway variables --set "DATABASE_URL=postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway"
    echo "✅ DATABASE_URL set"
else
    echo "✅ DATABASE_URL already set"
fi

echo ""
echo "🚀 Deploying from realtime-gateway directory..."
echo "   (This ensures Railway uses this directory as root)"
echo ""

railway up

echo ""
echo "✅ Deployment complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  IMPORTANT: Verify Root Directory in Dashboard"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Even though we deployed from realtime-gateway, please verify:"
echo "1. Go to Railway Dashboard → Your service → Settings"
echo "2. Check Root Directory is set to: realtime-gateway"
echo "3. If not, set it manually"
echo ""
echo "Wait 2-3 minutes, then test:"
echo "   curl https://web-production-40cac.up.railway.app/health"
echo ""

