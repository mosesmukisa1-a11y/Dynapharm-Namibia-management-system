#!/bin/bash
# Automated Railway Gateway Fix Script
# This script will help configure Railway via CLI

set -e

echo "🚂 Railway Gateway Auto-Fix Script"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${YELLOW}⚠️  Railway CLI not found.${NC}"
    echo "Installing Railway CLI..."
    npm install -g @railway/cli
    echo -e "${GREEN}✅ Railway CLI installed${NC}"
else
    echo -e "${GREEN}✅ Railway CLI found${NC}"
fi

echo ""
echo "Please make sure you're logged in to Railway:"
echo "  Run: railway login"
echo ""
read -p "Press Enter after you've logged in..."

# Navigate to realtime-gateway
cd "$(dirname "$0")/realtime-gateway"

echo ""
echo "📍 Current directory: $(pwd)"
echo ""

# Check if linked to Railway
if [ ! -f ".railway/link.json" ]; then
    echo "🔗 Linking to Railway project..."
    echo "   Please select your Railway project from the list"
    railway link
else
    echo -e "${GREEN}✅ Already linked to Railway project${NC}"
fi

echo ""
echo "🔧 Setting DATABASE_URL..."
railway variables set DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway'

echo ""
echo "📋 Current environment variables:"
railway variables

echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Check Railway Dashboard${NC}"
echo ""
echo "You still need to set the Root Directory in Railway Dashboard:"
echo "1. Go to Railway Dashboard → Your Realtime Gateway service"
echo "2. Settings → Service Settings"
echo "3. Set Root Directory to: realtime-gateway"
echo "4. Set Start Command to: node server.js"
echo "5. Save (Railway will auto-redeploy)"
echo ""

read -p "Press Enter after you've updated the Root Directory in Railway Dashboard..."

echo ""
echo "🚀 Deploying..."
railway up

echo ""
echo -e "${GREEN}✅ Deployment initiated!${NC}"
echo ""
echo "Next steps:"
echo "1. Wait 2-3 minutes for deployment"
echo "2. Test: curl https://web-production-40cac.up.railway.app/health"
echo "3. Check logs in Railway Dashboard if needed"
echo ""

