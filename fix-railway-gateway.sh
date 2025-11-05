#!/bin/bash
# Railway Gateway Fix Script - Automated Setup
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚂 Railway Gateway Auto-Fix Script${NC}"
echo "===================================="
echo ""

# Step 1: Check Railway CLI
if ! command -v railway &> /dev/null; then
    echo -e "${YELLOW}⚠️  Railway CLI not found. Installing...${NC}"
    npm install -g @railway/cli
    echo -e "${GREEN}✅ Railway CLI installed${NC}"
else
    echo -e "${GREEN}✅ Railway CLI found ($(railway --version))${NC}"
fi

echo ""

# Step 2: Check login status
echo "🔐 Checking Railway login status..."
if railway whoami &>/dev/null; then
    echo -e "${GREEN}✅ Already logged in to Railway${NC}"
    railway whoami
else
    echo -e "${YELLOW}⚠️  Not logged in. Please login now...${NC}"
    echo ""
    echo "This will open your browser for authentication."
    echo ""
    railway login
    echo ""
    echo -e "${GREEN}✅ Logged in successfully${NC}"
fi

echo ""

# Step 3: Navigate to realtime-gateway
cd "$(dirname "$0")/realtime-gateway"
echo "📍 Working directory: $(pwd)"
echo ""

# Step 4: Link to Railway project
if [ ! -f ".railway/link.json" ]; then
    echo "🔗 Linking to Railway project..."
    echo "   Please select your Railway project from the list:"
    echo ""
    railway link
    echo ""
    echo -e "${GREEN}✅ Linked to Railway project${NC}"
else
    echo -e "${GREEN}✅ Already linked to Railway project${NC}"
    # Show current project
    railway status 2>/dev/null || true
fi

echo ""

# Step 5: Set DATABASE_URL
echo "🔧 Setting DATABASE_URL environment variable..."
railway variables set DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway' 2>&1
echo -e "${GREEN}✅ DATABASE_URL set${NC}"

echo ""
echo "📋 Current environment variables:"
railway variables

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}⚠️  IMPORTANT: Manual Step Required${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Railway CLI cannot set the Root Directory automatically."
echo "You need to do this in the Railway Dashboard:"
echo ""
echo -e "${BLUE}1.${NC} Go to: ${BLUE}https://railway.app${NC}"
echo -e "${BLUE}2.${NC} Click on your project"
echo -e "${BLUE}3.${NC} Click on the ${BLUE}Realtime Gateway service${NC} (the one that's failing)"
echo -e "${BLUE}4.${NC} Go to ${BLUE}Settings${NC} → ${BLUE}Service Settings${NC}"
echo -e "${BLUE}5.${NC} Set ${BLUE}Root Directory${NC} to: ${GREEN}realtime-gateway${NC}"
echo -e "${BLUE}6.${NC} Set ${BLUE}Start Command${NC} to: ${GREEN}node server.js${NC}"
echo -e "${BLUE}7.${NC} Click ${BLUE}Save${NC} (Railway will auto-redeploy)"
echo ""
echo -e "${YELLOW}Press Enter after you've completed these steps...${NC}"
read -p ""

echo ""
echo "🚀 Triggering deployment..."
railway up

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Next steps:"
echo "1. Wait 2-3 minutes for Railway to deploy"
echo "2. Test the gateway:"
echo "   ${BLUE}curl https://web-production-40cac.up.railway.app/health${NC}"
echo ""
echo "Expected response:"
echo '   {"status":"ok","connectedClients":0,"db_connected":true,...}'
echo ""
echo "3. If you see errors, check logs:"
echo "   Railway Dashboard → Your service → Deployments → View Logs"
echo ""

