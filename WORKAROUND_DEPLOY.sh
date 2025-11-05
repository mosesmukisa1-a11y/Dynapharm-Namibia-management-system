#!/bin/bash
# Workaround: Deploy without Root Directory setting
# Uses start command to navigate to realtime-gateway

set -e

echo "🔧 Railway Root Directory Workaround"
echo "======================================"
echo ""

cd "$(dirname "$0")/realtime-gateway"

echo "📍 Current directory: $(pwd)"
echo ""

# Check Railway login
if ! railway whoami &>/dev/null; then
    echo "❌ Not logged in. Please login first:"
    echo "   railway login --browserless"
    exit 1
fi

echo "✅ Logged in to Railway"
echo ""

# Link to service
if [ ! -f ".railway/link.json" ]; then
    echo "🔗 Linking to Railway service..."
    railway link
    echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  WORKAROUND: Using Start Command Instead"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Since Railway can't find the root directory, we'll use"
echo "the Start Command workaround."
echo ""
echo "In Railway Dashboard:"
echo "1. Go to Settings → Deploy"
echo "2. Set Start Command to: cd realtime-gateway && node server.js"
echo "3. Leave Root Directory BLANK"
echo "4. Save"
echo ""
read -p "Press Enter after you've set the Start Command in Railway Dashboard..."

echo ""
echo "🚀 Triggering redeploy..."
railway redeploy

echo ""
echo "✅ Redeploy triggered!"
echo ""
echo "Wait 2-3 minutes, then test:"
echo "   curl https://web-production-40cac.up.railway.app/health"
echo ""

