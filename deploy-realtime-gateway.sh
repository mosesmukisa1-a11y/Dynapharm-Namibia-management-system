#!/bin/bash
# Deploy Realtime Gateway to Railway using CLI

set -e

echo "🚂 Deploying Realtime Gateway to Railway..."
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "⚠️  Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Navigate to realtime-gateway directory
cd "$(dirname "$0")/realtime-gateway"

echo "📍 Current directory: $(pwd)"
echo ""

# Check if linked to Railway project
if [ ! -f ".railway/link.json" ]; then
    echo "🔗 Linking to Railway project..."
    echo "   (You'll need to select your Railway project)"
    railway link
fi

# Set DATABASE_URL
echo "🔧 Setting DATABASE_URL..."
railway variables set DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway'

echo ""
echo "🚀 Deploying..."
railway up

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Check Railway dashboard for the deployment URL"
echo "2. Copy the URL (it will look like: https://your-service.up.railway.app)"
echo "3. Use this URL as REALTIME_GATEWAY_URL in Vercel"
echo ""
