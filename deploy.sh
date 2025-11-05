#!/bin/bash

echo "🚀 Dynapharm Cloud Deployment Script"
echo "=================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the dynapharm-cloud directory"
    exit 1
fi

echo "📋 Current status:"
git status --short
echo ""

echo "🔄 Adding all files to Git..."
git add .

echo "📝 Committing changes..."
git commit -m "Deploy Dynapharm Cloud System v2.0 - $(date)"

echo ""
echo "📤 Ready to push to GitHub!"
echo ""
echo "🔗 Next steps:"
echo "1. Create GitHub repository: https://github.com/new"
echo "2. Repository name: dynapharm-cloud"
echo "3. Set to Public"
echo "4. Run: git remote add origin https://github.com/mosesmukisa1-a11y/dynapharm-cloud.git"
echo "5. Run: git push -u origin main"
echo ""
echo "📖 Follow DEPLOY_NOW.md for complete deployment steps"
echo ""
echo "✅ Script completed!"
