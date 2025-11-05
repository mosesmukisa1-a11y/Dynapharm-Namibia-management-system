#!/bin/bash
# Quick deploy script - Make changes and deploy in one command

set -e

if [ -z "$1" ]; then
    echo "Usage: ./quick-deploy.sh 'Your change description'"
    echo "Example: ./quick-deploy.sh 'Add new feature'"
    exit 1
fi

COMMIT_MSG="$1"
PROJECT_DIR="/Users/moseswalker/Downloads/dynapharm-namibia-health-3"

echo "🚀 Quick Deploy Script"
echo "======================"
echo ""

cd "$PROJECT_DIR"

echo "📍 Current directory: $(pwd)"
echo ""

# Check for changes
if [ -z "$(git status --porcelain)" ]; then
    echo "⚠️  No changes to commit"
    echo "   Make some changes first, then run this script again"
    exit 0
fi

echo "📝 Changes detected:"
git status --short
echo ""

# Add all changes
echo "➕ Staging changes..."
git add .

# Commit
echo "💾 Committing: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

# Push
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Pushed to GitHub!"
echo ""
echo "⏳ Vercel will auto-deploy in ~30-60 seconds"
echo ""
echo "🌐 Live site: https://dynapharm-namibia-management-system-one.vercel.app/dynapharm-complete-system.html"
echo ""
echo "📊 Check deployment status:"
echo "   https://vercel.com/dashboard"
echo ""

