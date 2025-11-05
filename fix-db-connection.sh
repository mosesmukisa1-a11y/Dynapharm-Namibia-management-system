#!/bin/bash
# Fix Database Connection for Railway Gateway

echo "🔧 Fixing Database Connection..."
echo ""

cd "$(dirname "$0")/realtime-gateway"

echo "Current DATABASE_URL:"
railway variables | grep DATABASE_URL

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Option 1: Use External URL (Works across projects)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This will use the external database URL that works from anywhere:"
echo ""

read -p "Update DATABASE_URL to external URL? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    railway variables set DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway'
    echo "✅ DATABASE_URL updated to external URL"
    echo ""
    echo "Railway will auto-redeploy. Wait 2-3 minutes, then check logs."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Option 2: Find PostgreSQL Service Name"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Go to Railway Dashboard → Your project"
echo "2. Look for your PostgreSQL service"
echo "3. Check the service name (might be 'postgres', 'database', 'db', etc.)"
echo "4. Then run:"
echo "   railway variables set DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@SERVICE_NAME.railway.internal:5432/railway'"
echo "   (Replace SERVICE_NAME with your actual service name)"
echo ""

